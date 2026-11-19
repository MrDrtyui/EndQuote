import { environment, makeApp } from './app.js'
import {site} from './site.js'
const config = environment.safeParse(process.env)
if (!config.success) throw new Error('Invalid server environment: '+config.error.issues.map(i=>i.path.join('.')).join(', '))
const {app,db} = await makeApp(config.data)
await site(app,db)
for (const signal of ['SIGTERM','SIGINT']) process.once(signal, () => { void app.close() })
await app.listen({host:process.env.BIND_HOST ?? '127.0.0.1',port:config.data.PORT})
