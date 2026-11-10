import { initializeApp, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { envConfig } from '../../../config/env.config'
import { logger } from '../../../config/logger'
import { NotificationProvider, NotificationMetadata } from '../types'

const log = logger.child({ module: 'notification-providers' })

export class MockPushProvider implements NotificationProvider {
  async send(recipient: string, message: string): Promise<boolean> {
    const delay = Math.random() * 100 + 50 // 50-150ms
    await new Promise((resolve) => setTimeout(resolve, delay))

    const success = Math.random() > 0.05 // 95% success rate

    if (success) {
      log.info({ recipient }, 'Push notification sent (mock)')
    } else {
      log.warn({ recipient }, 'Push failed (mock)')
    }

    return success
  }
}
// Initialize once at module scope, same pattern as resendClient/twilioClient.
const firebaseApp = initializeApp({
  credential: cert({
    projectId: envConfig.firebaseProjectId,
    clientEmail: envConfig.firebaseClientEmail,
    privateKey: envConfig.firebasePrivateKey,
  }),
})

export class FirebasePushProvider implements NotificationProvider {
  async send(
    recipient: string,
    message: string,
    subject = 'Wavecom',
    metadata?: NotificationMetadata,

  ): Promise<boolean> {
    try {
      const response = await getMessaging(firebaseApp).send({
        token: recipient,
        notification: {
          title: subject,
          body: message,
        },
         data: metadata?.notificationId
    ? {
        notificationId: metadata.notificationId,
      }
    : undefined,
   
        webpush: {
          notification: {
          icon: "https://wavecom-frontend.vincyokafor.workers.dev/wavecom-icon.png",          },
          fcmOptions: {
          link: 'https://wavecom-frontend.vincyokafor.workers.dev/notifications',          },
        },
      })

      log.info({ recipient, messageId: response }, 'Push sent (Firebase)')
      return true
    } catch (error) {
      log.error({ err: error, recipient }, 'Error calling Firebase')
      return false
    }
  }
}
