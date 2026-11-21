import type {PrismaClient} from './generated/client.js'

type MailConfig = {
  APP_ORIGIN: string
  RESEND_API_KEY?: string
  MAIL_FROM?: string
}
type Options = {
  send?: typeof fetch
  now?: () => Date
  start?: boolean
}

const INTERVAL_MS = 30_000
const LEASE_MS = 120_000
const BATCH_SIZE = 25
const money = (amount: number) => new Intl.NumberFormat('ru-KZ', {maximumFractionDigits: 0}).format(amount)

// This outbox is deliberately separate from order submission. Only committed orders create
// records, and network errors must never turn an accepted order into a failed checkout.
export function orderNotifications(db: PrismaClient, config: MailConfig, options: Options = {}) {
  const enabled = Boolean(config.RESEND_API_KEY && config.MAIL_FROM)
  const send = options.send ?? fetch
  const now = options.now ?? (() => new Date())
  let stopped = false
  let running: Promise<void> | null = null

  async function flush() {
    if (!enabled) return 0
    const today = now()
    const due = await db.orderNotification.findMany({
      where: {
        sentAt: null,
        nextAttemptAt: {lte: today},
        OR: [{leaseUntil: null}, {leaseUntil: {lte: today}}],
      },
      orderBy: [{nextAttemptAt: 'asc'}, {createdAt: 'asc'}],
      take: BATCH_SIZE,
    })
    let handled = 0
    for (const job of due) {
      const claimedAt = now()
      const lease = new Date(+claimedAt + LEASE_MS)
      const claimed = await db.orderNotification.updateMany({
        where: {
          orderId: job.orderId,
          sentAt: null,
          nextAttemptAt: {lte: claimedAt},
          OR: [{leaseUntil: null}, {leaseUntil: {lte: claimedAt}}],
        },
        data: {leaseUntil: lease, attempts: {increment: 1}},
      })
      if (!claimed.count) continue // Another worker already took this job.

      // Never send an email to an address that the owner has since changed or unverified.
      // The payload stays immutable for retries, so Resend can deduplicate by order ID.
      let terminal = false
      let status = 0
      let retryAfterMs = 0
      try {
        const order = await db.cleaningOrder.findUnique({
          where: {id: job.orderId},
          select: {business: {select: {owner: {select: {normalizedEmail: true, verifiedAt: true}}}}},
        })
        const owner = order?.business.owner
        if (!owner?.verifiedAt || owner.normalizedEmail !== job.recipientEmail) {
          terminal = true
          console.warn('EndQuote order email skipped: recipient no longer verified')
        } else {
          const link = config.APP_ORIGIN + '/owner#orders'
          const response = await send('https://api.resend.com/emails', {
            method: 'POST',
            redirect: 'error',
            signal: AbortSignal.timeout(8000),
            headers: {
              Authorization: 'Bearer ' + config.RESEND_API_KEY,
              'Content-Type': 'application/json',
              'Idempotency-Key': 'order-notification:' + job.orderId,
            },
            body: JSON.stringify({
              from: config.MAIL_FROM,
              to: [job.recipientEmail],
              subject: 'Новая заявка · ' + job.businessName + ' · EndQuote',
              text: 'В EndQuote поступила новая заявка для «' + job.businessName + '».\n\n' +
                'Предварительная стоимость: ' + money(job.total) + ' ₸.\n' +
                'Открыть заявки: ' + link + '\n\n' +
                'Детали клиента доступны только в защищённом кабинете EndQuote.\n' +
                'Это автоматическое уведомление, не подтверждение даты выезда.',
            }),
          })
          status = response.status
          retryAfterMs = response.status === 429
            ? Math.min(3_600_000, Math.max(0, Number(response.headers.get('retry-after')) || 0) * 1000)
            : 0
          if (response.ok) {
            const result: unknown = await response.json()
            terminal = typeof result === 'object' && result !== null &&
              'id' in result && typeof result.id === 'string' && result.id.length > 0
          }
        }
      } catch {
        // Network/JSON errors are retried; do not log addresses, customer details or API replies.
      }

      if (terminal) {
        await db.orderNotification.updateMany({
          where: {orderId: job.orderId, sentAt: null, leaseUntil: lease},
          data: {sentAt: now(), leaseUntil: null},
        })
      } else {
        const attempts = job.attempts + 1
        const backoffMs = Math.min(3_600_000, 30_000 * 2 ** Math.min(attempts - 1, 7))
        await db.orderNotification.updateMany({
          where: {orderId: job.orderId, sentAt: null, leaseUntil: lease},
          data: {
            leaseUntil: null,
            nextAttemptAt: new Date(+now() + Math.max(backoffMs, retryAfterMs)),
          },
        })
        console.warn('EndQuote order email scheduled for retry' + (status ? ' (HTTP ' + status + ')' : ''))
      }
      handled++
    }
    return handled
  }

  function kick() {
    if (!enabled || stopped || running) return
    running = flush().then(() => {}).catch(() => {
      console.error('EndQuote notification worker failed; retry scheduled')
    }).finally(() => { running = null })
  }

  const timer = enabled && options.start !== false ? setInterval(kick, INTERVAL_MS) : null
  timer?.unref()
  if (timer) queueMicrotask(kick) // Recover undelivered jobs after a restart.

  async function stop() {
    stopped = true
    if (timer) clearInterval(timer)
    await running
  }
  return {flush, kick, stop}
}
