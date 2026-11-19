import {
  Component,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ErrorInfo,
  type ReactNode,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import {
  Box3,
  CanvasTexture,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Spherical,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FurnitureAsset } from '../types';

type ViewerState = 'loading' | 'ready' | 'fallback';
type Controls = ComponentRef<typeof OrbitControls>;

export interface FurnitureViewerProps {
  asset: FurnitureAsset;
  resetToken: number;
  onReady?: (ready: boolean) => void;
  onError?: (message: string) => void;
}

interface ModelLoad {
  key: string;
  object: Object3D | null;
  progress: number | null;
  error: string | null;
}

/** Every load is owned by this viewer, so changing selection also frees its GPU resources. */
function disposeModel(object: Object3D) {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.geometry.dispose();
    const slots = Array.isArray(child.material) ? child.material : [child.material];
    slots.forEach((material) => materials.add(material));
  });
  materials.forEach((material) => {
    Object.values(material).forEach((value: unknown) => {
      if (value instanceof Texture) textures.add(value);
    });
    material.dispose();
  });
  textures.forEach((texture) => {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
  });
}

function supportsWebGL() {
  try {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2', { powerPreference: 'low-power' });
    if (!context) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

async function downloadModel(
  url: string,
  signal: AbortSignal,
  onProgress: (progress: number | null) => void,
) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Model download failed (HTTP ${response.status}).`);
  const length = Number(response.headers.get('Content-Length'));
  if (!response.body) return response.arrayBuffer();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress(length > 0 ? Math.min(94, Math.round((received / length) * 94)) : null);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

class CanvasBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onError('Не удалось запустить 3D. Можно воспользоваться изображением мебели.');
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function RendererLifecycle({ onError }: { onError: (message: string) => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const lost = (event: Event) => {
      event.preventDefault();
      onError('3D-просмотр был прерван. Повторите загрузку или воспользуйтесь изображением мебели.');
    };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl, onError]);
  return null;
}

function ContactShadow({ bounds }: { bounds: Box3 }) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const gradient = context.createRadialGradient(64, 64, 10, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(45, 37, 28, 0.24)');
    gradient.addColorStop(0.55, 'rgba(45, 37, 28, 0.12)');
    gradient.addColorStop(1, 'rgba(45, 37, 28, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture?.dispose(), [texture]);
  const center = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  if (!texture) return null;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, bounds.min.y + 0.001, center.z]}>
      <planeGeometry args={[size.x * 1.3, size.z * 1.3]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function FurnitureScene({
  object,
  resetToken,
  wrapperRef,
  onReady,
}: {
  object: Object3D;
  resetToken: number;
  wrapperRef: RefObject<HTMLDivElement | null>;
  onReady: () => void;
}) {
  const controls = useRef<Controls>(null);
  const { camera, size, gl, invalidate } = useThree();
  const pendingReady = useRef(true);
  const changeCount = useRef(0);
  const bounds = useMemo(() => {
    object.updateWorldMatrix(true, true);
    const box = new Box3().setFromObject(object);
    if (box.isEmpty()) throw new Error('The selected model contains no visible geometry.');
    return box;
  }, [object]);

  const recordCamera = useCallback(() => {
    invalidate();
    if (import.meta.env.DEV && wrapperRef.current) {
      wrapperRef.current.dataset.dpr = String(gl.getPixelRatio());
      wrapperRef.current.dataset.cameraPosition = JSON.stringify(
        camera.position.toArray().map((value) => Number(value.toFixed(5))),
      );
      wrapperRef.current.dataset.orbitChangeCount = String(++changeCount.current);
    }
  }, [camera, gl, invalidate, wrapperRef]);

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return;
    const target = bounds.getCenter(new Vector3());
    const extent = bounds.getSize(new Vector3());
    const direction = new Vector3(1.25, 0.95, 1.65).normalize();
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize();
    const up = new Vector3().crossVectors(direction, right).normalize();
    const verticalTangent = Math.tan((camera.fov * Math.PI) / 360);
    const horizontalTangent = verticalTangent * (Math.max(1, size.width) / Math.max(1, size.height));
    let distance = 0.3;
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const corner = new Vector3(x, y, z).sub(target);
          const depth = corner.dot(direction);
          distance = Math.max(
            distance,
            depth + (Math.abs(corner.dot(right)) * 1.22) / horizontalTangent,
            depth + (Math.abs(corner.dot(up)) * 1.22) / verticalTangent,
          );
        }
      }
    }
    // Flush damping momentum before restoring the complete reference pose.
    const damping = controls.current.enableDamping;
    controls.current.enableDamping = false;
    controls.current.update();
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.up.set(0, 1, 0);
    camera.near = 0.01;
    camera.far = Math.max(50, distance + extent.length() * 15);
    camera.updateProjectionMatrix();
    camera.lookAt(target);
    controls.current.target.copy(target);
    controls.current.minDistance = Math.max(0.22, extent.length() * 0.25);
    controls.current.maxDistance = Math.max(distance * 2.7, extent.length() * 3);
    controls.current.update();
    controls.current.enableDamping = damping;
    controls.current.saveState();
    pendingReady.current = true;
    recordCamera();
  }, [bounds, camera, size.width, size.height, resetToken, recordCamera]);

  useFrame(() => {
    if (pendingReady.current) {
      pendingReady.current = false;
      queueMicrotask(onReady);
    }
  });

  useEffect(() => {
    const canvas = gl.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Интерактивная модель мебели. Стрелки — вращение, плюс и минус — масштаб, Home — исходный вид.');
    const keyboard = (event: KeyboardEvent) => {
      const orbit = controls.current;
      if (!orbit || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_', 'Home'].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Home') orbit.reset();
      else {
        const position = new Spherical().setFromVector3(camera.position.clone().sub(orbit.target));
        if (event.key === 'ArrowLeft') position.theta -= 0.13;
        if (event.key === 'ArrowRight') position.theta += 0.13;
        if (event.key === 'ArrowUp') position.phi -= 0.1;
        if (event.key === 'ArrowDown') position.phi += 0.1;
        if (event.key === '+' || event.key === '=') position.radius *= 0.88;
        if (event.key === '-' || event.key === '_') position.radius /= 0.88;
        position.phi = Math.max(orbit.minPolarAngle, Math.min(orbit.maxPolarAngle, position.phi));
        position.radius = Math.max(orbit.minDistance, Math.min(orbit.maxDistance, position.radius));
        camera.position.copy(orbit.target).add(new Vector3().setFromSpherical(position));
        orbit.update();
      }
      recordCamera();
    };
    canvas.addEventListener('keydown', keyboard);
    return () => {
      canvas.removeEventListener('keydown', keyboard);
    };
  }, [camera, gl, recordCamera]);

  return (
    <>
      <primitive object={object} dispose={null} />
      <ContactShadow bounds={bounds} />
      <OrbitControls
        ref={controls}
        makeDefault
        autoRotate={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.65}
        zoomSpeed={0.8}
        minPolarAngle={0.12}
        maxPolarAngle={Math.PI / 2 - 0.045}
        onChange={recordCamera}
      />
    </>
  );
}

export default function FurnitureViewer({ asset, resetToken, onReady, onError }: FurnitureViewerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const [attempt, setAttempt] = useState(0);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState('');
  const [loaded, setLoaded] = useState<ModelLoad>({ key: '', object: null, progress: null, error: null });
  const loadKey = `${asset.id}:${asset.model}:${attempt}`;

  useEffect(() => {
    const supported = supportsWebGL();
    setWebgl(supported);
    setRenderError(null);
    if (!supported) callbacks.current.onError?.('Браузер не поддерживает 3D-просмотр. Доступно изображение мебели.');
  }, [attempt]);

  const fail = useCallback((message: string) => {
    setRenderError(message);
    callbacks.current.onReady?.(false);
    callbacks.current.onError?.(message);
  }, []);

  useEffect(() => {
    callbacks.current.onReady?.(false);
    setRenderError(null);
    setReadyKey('');
    if (webgl !== true) return;
    const abort = new AbortController();
    let active = true;
    let model: Object3D | null = null;
    setLoaded({ key: loadKey, object: null, progress: 0, error: null });
    void (async () => {
      try {
        const buffer = await downloadModel(asset.model, abort.signal, (progress) => {
          if (active) setLoaded((current) => ({ ...current, progress }));
        });
        if (!active) return;
        setLoaded((current) => ({ ...current, progress: 96 }));
        const base = new URL('.', new URL(asset.model, window.location.href)).href;
        const gltf = await new GLTFLoader().parseAsync(buffer, base);
        if (!active) {
          disposeModel(gltf.scene);
          return;
        }
        model = gltf.scene;
        setLoaded({ key: loadKey, object: model, progress: 100, error: null });
      } catch (error) {
        if (!active || abort.signal.aborted) return;
        const detail = error instanceof Error ? error.message : '';
        const message = detail.includes('HTTP')
          ? `Не удалось загрузить 3D-модель (${detail.match(/HTTP \d+/)?.[0] ?? 'ошибка загрузки'}).`
          : 'Не удалось загрузить 3D-модель. Доступно изображение мебели.';
        setLoaded({ key: loadKey, object: null, progress: null, error: message });
        callbacks.current.onError?.(message);
      }
    })();
    return () => {
      active = false;
      abort.abort();
      if (model) disposeModel(model);
    };
  }, [asset.model, loadKey, webgl]);

  const markReady = useCallback(() => {
    setReadyKey(loadKey);
    callbacks.current.onReady?.(true);
  }, [loadKey]);
  const current = loaded.key === loadKey ? loaded : null;
  const error = renderError || current?.error || (webgl === false ? 'Браузер не поддерживает 3D-просмотр. Доступно изображение мебели.' : null);
  const state: ViewerState = error ? 'fallback' : current?.object && readyKey === loadKey ? 'ready' : 'loading';

  return (
    <div
      ref={wrapperRef}
      className="viewer-stage"
      data-viewer-state={state}
      data-model-id={asset.id}
      data-model-url={asset.model}
      aria-busy={state === 'loading'}
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 280, overflow: 'hidden', background: '#f4f3ef' }}
    >
      {state === 'fallback' ? (
        <div className="viewer-fallback" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
          <img src={asset.preview} alt={`${asset.name} — изображение мебели`} style={{ width: '100%', minHeight: 0, flex: '1 1 auto', objectFit: 'contain', maxHeight: '76%' }} />
          <p role="alert" style={{ margin: 0, maxWidth: 400, textAlign: 'center', fontSize: 13, lineHeight: 1.5 }}>{error}</p>
          <button type="button" className="viewer-retry" onClick={() => { setWebgl(null); setAttempt((value) => value + 1); }}>Повторить 3D-просмотр</button>
        </div>
      ) : webgl === true ? (
        <CanvasBoundary key={`renderer-${attempt}`} onError={fail}>
          <Canvas
            frameloop="demand"
            dpr={[1, 1.5]}
            shadows={false}
            gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
            camera={{ fov: 35, near: 0.01, far: 100, position: [3, 2, 4] }}
            style={{ width: '100%', height: '100%', minHeight: 280, touchAction: 'none' }}
          >
            <color attach="background" args={['#f4f3ef']} />
            <RendererLifecycle onError={fail} />
            <ambientLight intensity={0.7} />
            <hemisphereLight args={['#fffdf7', '#b3aaa0', 1.35]} />
            <directionalLight position={[3.5, 6, 5]} color="#fff2df" intensity={2.1} />
            <directionalLight position={[-4, 3, 2]} color="#eef3ff" intensity={1.05} />
            <directionalLight position={[1, 4, -4]} color="#ffffff" intensity={1.45} />
            {current?.object && (
              <FurnitureScene key={loadKey} object={current.object} resetToken={resetToken} wrapperRef={wrapperRef} onReady={markReady} />
            )}
          </Canvas>
        </CanvasBoundary>
      ) : null}

      {state === 'loading' && (
        <div className="viewer-loading" role="status" aria-live="polite" style={{ position: 'absolute', inset: 0, display: 'grid', placeContent: 'center', justifyItems: 'center', gap: 12, background: '#f4f3ef', pointerEvents: 'none' }}>
          <span style={{ fontSize: 13 }}>Загружаем 3D-модель{current?.progress != null ? ` · ${current.progress}%` : '…'}</span>
          <div className="viewer-progress" role="progressbar" aria-label="Загрузка 3D-модели" aria-valuemin={0} aria-valuemax={100} aria-valuenow={current?.progress ?? undefined} style={{ width: 144, height: 3, borderRadius: 4, background: '#dedbd3', overflow: 'hidden' }}>
            <div style={{ width: `${current?.progress ?? 12}%`, height: '100%', borderRadius: 4, background: '#796f5c', transition: 'width 120ms ease' }} />
          </div>
        </div>
      )}
      <span className="viewer-status" role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, margin: -1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
        {state === 'ready' ? `${asset.name}: модель готова. Перетаскивайте для вращения, используйте прокрутку или щипок для масштаба. С клавиатуры доступны стрелки, плюс, минус и Home.` : ''}
      </span>
    </div>
  );
}
