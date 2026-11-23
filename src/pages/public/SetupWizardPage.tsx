import { toAppPath } from '@/utils/appPath'
import { useState } from 'react'

import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Selector } from '@astryxdesign/core/Selector'
import { Switch } from '@astryxdesign/core/Switch'
import { useI18n } from '~/i18n'
import { buildGatewayUrl } from '~/lib/api/client'

interface DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  dbname: string
  sslmode: string
}

interface RedisConfig {
  host: string
  port: number
  username: string
  password: string
  db: number
  enable_tls: boolean
}

interface AdminConfig {
  email: string
  password: string
}

interface ServerConfig {
  host: string
  port: number
  mode: string
}

interface InstallRequest {
  database: DatabaseConfig
  redis: RedisConfig
  admin: AdminConfig
  server: ServerConfig
}

/**
 * SetupWizardPage - Initial system setup wizard
 * Equivalent to setup/SetupWizardView.vue
 */
export function SetupWizardPage() {
  const { t } = useI18n()

  const [currentStep, setCurrentStep] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [installSuccess, setInstallSuccess] = useState(false)

  const [testingDb, setTestingDb] = useState(false)
  const [testingRedis, setTestingRedis] = useState(false)
  const [dbConnected, setDbConnected] = useState(false)
  const [redisConnected, setRedisConnected] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [serviceReady, setServiceReady] = useState(false)

  const getCurrentPort = (): number => {
    const port = window.location.port
    if (port) return parseInt(port, 10)
    return window.location.protocol === 'https:' ? 443 : 80
  }

  const [formData, setFormData] = useState<InstallRequest>({
    database: {
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: '',
      dbname: 'sub2api',
      sslmode: 'disable',
    },
    redis: {
      host: 'localhost',
      port: 6379,
      username: '',
      password: '',
      db: 0,
      enable_tls: false,
    },
    admin: {
      email: '',
      password: '',
    },
    server: {
      host: '0.0.0.0',
      port: getCurrentPort(),
      mode: 'release',
    },
  })

  const steps = [
    { id: 'database', header: t('setup.database.title') },
    { id: 'redis', header: t('setup.redis.title') },
    { id: 'admin', header: t('setup.admin.title') },
    { id: 'complete', header: t('setup.ready.title') },
  ]

  const canProceed = (() => {
    switch (currentStep) {
      case 0:
        return dbConnected
      case 1:
        return redisConnected
      case 2:
        return (
          formData.admin.email &&
          formData.admin.password.length >= 8 &&
          formData.admin.password === confirmPassword
        )
      default:
        return true
    }
  })()

  const testDatabaseConnection = async () => {
    setTestingDb(true)
    setErrorMessage('')
    setDbConnected(false)

    try {
      const response = await fetch(buildGatewayUrl('/setup/test-db'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData.database),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || data.message || 'Connection failed')
      }

      setDbConnected(true)
    } catch (error: any) {
      setErrorMessage(error.message || 'Connection failed')
    } finally {
      setTestingDb(false)
    }
  }

  const testRedisConnection = async () => {
    setTestingRedis(true)
    setErrorMessage('')
    setRedisConnected(false)

    try {
      const response = await fetch(buildGatewayUrl('/setup/test-redis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData.redis),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || data.message || 'Connection failed')
      }

      setRedisConnected(true)
    } catch (error: any) {
      setErrorMessage(error.message || 'Connection failed')
    } finally {
      setTestingRedis(false)
    }
  }

  const nextStep = () => {
    if (canProceed) {
      setErrorMessage('')
      setCurrentStep(currentStep + 1)
    }
  }

  const performInstall = async () => {
    setInstalling(true)
    setErrorMessage('')

    try {
      const response = await fetch(buildGatewayUrl('/setup/install'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.detail || data.message || 'Installation failed')
      }

      setInstallSuccess(true)
      waitForServiceRestart()
    } catch (error: any) {
      setErrorMessage(error.message || 'Installation failed')
    } finally {
      setInstalling(false)
    }
  }

  const waitForServiceRestart = async () => {
    const maxAttempts = 60
    const interval = 1000

    await new Promise((resolve) => setTimeout(resolve, 3000))

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await fetch(buildGatewayUrl('/setup/status'), {
          method: 'GET',
          cache: 'no-store',
        })

        if (response.ok) {
          const data = await response.json()
          if (data.data && !data.data.needs_setup) {
            setServiceReady(true)
            setTimeout(() => {
              window.location.href = toAppPath('/login')
            }, 1500)
            return
          }
        }
      } catch {
        // Continue polling
      }

      await new Promise((resolve) => setTimeout(resolve, interval))
    }

    setErrorMessage(t('setup.status.timeout'))
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-dark-900 dark:to-dark-800">
      <div className="w-full max-w-2xl">
        {/* Logo & Title */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg">
            ⚙️
          </div>
          <Heading level={1} className="text-3xl font-bold">
            {t('setup.title')}
          </Heading>
          <Text color="secondary" className="mt-2">
            {t('setup.description')}
          </Text>
        </div>

        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-center">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                    currentStep > index
                      ? 'bg-primary-500 text-white'
                      : currentStep === index
                        ? 'bg-primary-500 text-white ring-4 ring-primary-100 dark:ring-primary-900'
                        : 'bg-gray-200 text-gray-500 dark:bg-dark-700 dark:text-dark-400'
                  }`}
                >
                  {currentStep > index ? '✓' : index + 1}
                </div>
                <Text

                  weight="medium"
                  className={`ml-2 hidden sm:inline ${
                    currentStep >= index ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-dark-500'
                  }`}
                >
                  {step.header}
                </Text>
                {index < steps.length - 1 && (
                  <div
                    className={`mx-2 h-0.5 w-6 sm:mx-3 sm:w-12 ${
                      currentStep > index ? 'bg-primary-500' : 'bg-gray-200 dark:bg-dark-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-dark-800">
          {/* Step 1: Database */}
          {currentStep === 0 && (
            <div className="space-y-6">
              <div className="mb-6 text-center">
                <Heading level={2} className="text-xl font-semibold">
                  {t('setup.database.title')}
                </Heading>
                <Text color="secondary" className="mt-1 text-sm">
                  {t('setup.database.description')}
                </Text>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.database.host')}
                  </label>
                  <TextInput
                    label=""
                    isLabelHidden
                    value={formData.database.host}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        database: { ...formData.database, host: value },
                      })
                    }
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.database.port')}
                  </label>
                  <TextInput
                    label=""
                    isLabelHidden
                    value={formData.database.port.toString()}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        database: { ...formData.database, port: parseInt(value, 10) || 5432 },
                      })
                    }
                    placeholder="5432"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.database.username')}
                  </label>
                  <TextInput
                    label=""
                    isLabelHidden
                    value={formData.database.user}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        database: { ...formData.database, user: value },
                      })
                    }
                    placeholder="postgres"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.database.password')}
                  </label>
                  <TextInput
                    label=""
                    isLabelHidden
                    type="password"
                    value={formData.database.password}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        database: { ...formData.database, password: value },
                      })
                    }
                    placeholder={t('setup.database.passwordPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.database.databaseName')}
                  </label>
                  <TextInput
                    label=""
                    isLabelHidden
                    value={formData.database.dbname}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        database: { ...formData.database, dbname: value },
                      })
                    }
                    placeholder="sub2api"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.database.sslMode')}
                  </label>
                  <Selector
                    label=""
                    isLabelHidden
                    value={formData.database.sslmode}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        database: { ...formData.database, sslmode: value },
                      })
                    }
                    options={[
                      { value: 'disable', label: t('setup.database.ssl.disable') },
                      { value: 'require', label: t('setup.database.ssl.require') },
                      { value: 'verify-ca', label: t('setup.database.ssl.verifyCa') },
                      { value: 'verify-full', label: t('setup.database.ssl.verifyFull') },
                    ]}
                  />
                </div>
              </div>

              <Button
                onClick={testDatabaseConnection}
                isDisabled={testingDb}
                variant="secondary"
                label={
                  testingDb
                    ? t('setup.status.testing')
                    : dbConnected
                      ? t('setup.status.success')
                      : t('setup.status.testConnection')
                }
                className="w-full"
              />
            </div>
          )}

          {/* Step 2: Redis */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="mb-6 text-center">
                <Heading level={2} className="text-xl font-semibold">
                  {t('setup.redis.title')}
                </Heading>
                <Text color="secondary" className="mt-1 text-sm">
                  {t('setup.redis.description')}
                </Text>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.redis.host')}
                  </label>
                  <TextInput
                    label=""
                    isLabelHidden
                    value={formData.redis.host}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        redis: { ...formData.redis, host: value },
                      })
                    }
                    placeholder="localhost"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.redis.port')}
                  </label>
                  <TextInput
                    label=""
                    isLabelHidden
                    value={formData.redis.port.toString()}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        redis: { ...formData.redis, port: parseInt(value, 10) || 6379 },
                      })
                    }
                    placeholder="6379"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.redis.username')}
                  </label>
                  <TextInput
                    label=""
                    isLabelHidden
                    value={formData.redis.username}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        redis: { ...formData.redis, username: value },
                      })
                    }
                    placeholder={t('setup.redis.usernamePlaceholder')}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('setup.redis.password')}
                  </label>
                  <TextInput
                    label=""
                    isLabelHidden
                    type="password"
                    value={formData.redis.password}
                    onChange={(value) =>
                      setFormData({
                        ...formData,
                        redis: { ...formData.redis, password: value },
                      })
                    }
                    placeholder={t('setup.redis.passwordPlaceholder')}
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('setup.redis.database')}
                </label>
                <TextInput
                  label=""
                  isLabelHidden
                  value={formData.redis.db.toString()}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      redis: { ...formData.redis, db: parseInt(value, 10) || 0 },
                    })
                  }
                  placeholder="0"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-gray-200 p-3 dark:border-dark-700">
                <div>
                  <Text weight="medium" className="text-sm">
                    {t('setup.redis.enableTls')}
                  </Text>
                  <Text color="secondary" className="text-xs">
                    {t('setup.redis.enableTlsHint')}
                  </Text>
                </div>
                <Switch
                  label=""
                  isLabelHidden
                  value={formData.redis.enable_tls}
                  onChange={(checked) =>
                    setFormData({
                      ...formData,
                      redis: { ...formData.redis, enable_tls: checked },
                    })
                  }
                />
              </div>

              <Button
                onClick={testRedisConnection}
                isDisabled={testingRedis}
                variant="secondary"
                label={
                  testingRedis
                    ? t('setup.status.testing')
                    : redisConnected
                      ? t('setup.status.success')
                      : t('setup.status.testConnection')
                }
                className="w-full"
              />
            </div>
          )}

          {/* Step 3: Admin */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="mb-6 text-center">
                <Heading level={2} className="text-xl font-semibold">
                  {t('setup.admin.title')}
                </Heading>
                <Text color="secondary" className="mt-1 text-sm">
                  {t('setup.admin.description')}
                </Text>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('setup.admin.email')}
                </label>
                <TextInput
                  label=""
                  isLabelHidden
                  type="email"
                  value={formData.admin.email}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      admin: { ...formData.admin, email: value },
                    })
                  }
                  placeholder="admin@example.test"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('setup.admin.password')}
                </label>
                <TextInput
                  label=""
                  isLabelHidden
                  type="password"
                  value={formData.admin.password}
                  onChange={(value) =>
                    setFormData({
                      ...formData,
                      admin: { ...formData.admin, password: value },
                    })
                  }
                  placeholder={t('setup.admin.passwordPlaceholder')}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('setup.admin.confirmPassword')}
                </label>
                <TextInput
                  label=""
                  isLabelHidden
                  type="password"
                  value={confirmPassword}
                  onChange={(value) => setConfirmPassword(value)}
                  placeholder={t('setup.admin.confirmPasswordPlaceholder')}
                />
                {confirmPassword && formData.admin.password !== confirmPassword && (
                  <Text className="mt-1 text-sm text-red-600 dark:text-red-400">
                    {t('setup.admin.passwordMismatch')}
                  </Text>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Complete */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="mb-6 text-center">
                <Heading level={2} className="text-xl font-semibold">
                  {t('setup.ready.title')}
                </Heading>
                <Text color="secondary" className="mt-1 text-sm">
                  {t('setup.ready.description')}
                </Text>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-700">
                  <Text weight="medium" className="mb-2 text-sm text-gray-500 dark:text-dark-400">
                    {t('setup.ready.database')}
                  </Text>
                  <Text className="text-gray-900 dark:text-white">
                    {formData.database.user}@{formData.database.host}:{formData.database.port}/
                    {formData.database.dbname}
                  </Text>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-700">
                  <Text weight="medium" className="mb-2 text-sm text-gray-500 dark:text-dark-400">
                    {t('setup.ready.redis')}
                  </Text>
                  <Text className="text-gray-900 dark:text-white">
                    {formData.redis.host}:{formData.redis.port}
                  </Text>
                </div>

                <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-700">
                  <Text weight="medium" className="mb-2 text-sm text-gray-500 dark:text-dark-400">
                    {t('setup.ready.adminEmail')}
                  </Text>
                  <Text className="text-gray-900 dark:text-white">{formData.admin.email}</Text>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800/50 dark:bg-red-900/20">
              <Text className="text-sm text-red-700 dark:text-red-400">{errorMessage}</Text>
            </div>
          )}

          {/* Success Message */}
          {installSuccess && (
            <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800/50 dark:bg-green-900/20">
              <div className="flex items-start gap-3">
                <div>
                  <Text weight="medium" className="text-sm text-green-700 dark:text-green-400">
                    {t('setup.status.completed')}
                  </Text>
                  <Text className="mt-1 text-sm text-green-600 dark:text-green-500">
                    {serviceReady ? t('setup.status.redirecting') : t('setup.status.restarting')}
                  </Text>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="mt-8 flex justify-between">
            {currentStep > 0 && !installSuccess ? (
              <Button
                onClick={() => setCurrentStep(currentStep - 1)}
                variant="secondary"
                label={`← ${t('common.back')}`}
              />
            ) : (
              <div />
            )}

            {currentStep < 3 ? (
              <Button
                onClick={nextStep}
                isDisabled={!canProceed}
                variant="primary"
                label={`${t('common.next')} →`}
              />
            ) : !installSuccess ? (
              <Button
                onClick={performInstall}
                isDisabled={installing}
                variant="primary"
                label={installing ? t('setup.status.installing') : t('setup.status.completeInstallation')}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
