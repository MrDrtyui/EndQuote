import { Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei/core/ContactShadows.js'
import { Group, MathUtils, Mesh, OrthographicCamera } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

function Sofa() {
  const { scene } = useLoader(GLTFLoader, '/models/sofa-2-seater.glb')
  const { camera, gl, size, invalidate } = useThree()
  const pivot = useRef<Group>(null)
  const targetYaw = useRef(0)
  const firstFrame = useRef(true)

  useLayoutEffect(() => {
    scene.traverse(child => {
      if (child instanceof Mesh) child.castShadow = child.receiveShadow = true
    })
  }, [scene])

  useLayoutEffect(() => {
    if (!(camera instanceof OrthographicCamera)) return
    camera.zoom = size.width / 2.32
    camera.lookAt(0, 0.45, 0)
    camera.updateProjectionMatrix()
    invalidate()
  }, [camera, size.width, invalidate])

  useEffect(() => {
    const hero = gl.domElement.closest('section')
    if (!hero) return
    const motion = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)')
    const follow = (event: PointerEvent) => {
      targetYaw.current = (event.clientX / window.innerWidth - 0.5) * 0.075
      invalidate()
    }
    const center = () => { targetYaw.current = 0; invalidate() }
    const configure = () => {
      if (motion.matches) {
        hero.addEventListener('pointermove', follow)
        hero.addEventListener('pointerleave', center)
      } else {
        hero.removeEventListener('pointermove', follow)
        hero.removeEventListener('pointerleave', center)
        if (pivot.current) pivot.current.rotation.y = 0
        center()
      }
    }
    configure()
    motion.addEventListener('change', configure)
    return () => {
      hero.removeEventListener('pointermove', follow)
      hero.removeEventListener('pointerleave', center)
      motion.removeEventListener('change', configure)
    }
  }, [gl, invalidate])

  useFrame((_, delta) => {
    if (firstFrame.current) {
      gl.domElement.dataset.modelReady = 'true'
      firstFrame.current = false
    }
    if (!pivot.current) return
    const rotation = pivot.current.rotation
    rotation.y = MathUtils.damp(rotation.y, targetYaw.current, 6, Math.min(delta, 0.05))
    if (Math.abs(rotation.y - targetYaw.current) > 0.0001) invalidate()
  })

  return <group ref={pivot}>
    <primitive object={scene} dispose={null} />
    <ContactShadows position={[0, -0.004, 0]} scale={3.1} resolution={256} frames={1}
      far={1.1} blur={3.2} opacity={0.37} color="#493c2e" />
  </group>
}

export default function HeroSofa() {
  return <Canvas shadows orthographic camera={{ position: [2.45, 2.04, 6.4], near: 0.1, far: 20 }}
    frameloop="demand" dpr={[1, 1.5]} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <hemisphereLight args={['#fff8ee', '#a69c90', 0.98]} />
    <directionalLight castShadow position={[-3, 4, 2.5]} color="#fff5e8" intensity={2.35}
      shadow-mapSize={[512, 512]} shadow-camera-left={-1.5} shadow-camera-right={1.5}
      shadow-camera-top={1.5} shadow-camera-bottom={-1.5} shadow-camera-near={1} shadow-camera-far={10}
      shadow-bias={-0.001} shadow-normalBias={0.012} shadow-radius={3} />
    <directionalLight position={[1.5, 2, -3]} color="#ffffff" intensity={1.3} />
    <Suspense fallback={null}><Sofa /></Suspense>
  </Canvas>
}
