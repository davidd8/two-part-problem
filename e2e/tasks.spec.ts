import { expect, test } from '@playwright/test'
import { SEEDED_TITLES, resetDatabase } from './helpers.js'

test.beforeEach(() => {
  resetDatabase()
})

test('renders the seeded tasks', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(SEEDED_TITLES.length)
  for (const title of SEEDED_TITLES) {
    await expect(page.getByText(title)).toBeVisible()
  }
})

test('a created task survives a page reload', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('Task title').fill('Write an e2e test')
  await page.getByLabel('Notes').fill('with Playwright')
  // exact: true — otherwise this also matches aria-label="Delete Add a migration".
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('Write an e2e test')).toBeVisible()

  // The reload is the point: this only passes if the row reached SQLite.
  await page.reload()
  await expect(page.getByText('Write an e2e test')).toBeVisible()
  await expect(page.getByText('with Playwright')).toBeVisible()
})

test('completing a task moves it between the filters', async ({ page }) => {
  await page.goto('/')

  // Re-query rather than reuse: the app re-renders the list after every
  // mutation, so the element clicked is detached by the time it settles.
  const task = () => page.getByRole('listitem').filter({ hasText: 'Build a feature' })
  await task().getByRole('checkbox').click()
  await expect(task().getByRole('checkbox')).toBeChecked()

  await page.getByRole('button', { name: 'open' }).click()
  await expect(page.getByText('Build a feature')).toBeHidden()

  await page.getByRole('button', { name: 'done' }).click()
  await expect(page.getByText('Build a feature')).toBeVisible()

  // Still done after a reload, so the PATCH was persisted.
  await page.reload()
  await page.getByRole('button', { name: 'done' }).click()
  await expect(page.getByText('Build a feature')).toBeVisible()
})

test('deleting a task removes it for good', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Delete Add a migration' }).click()

  await expect(page.getByRole('listitem')).toHaveCount(SEEDED_TITLES.length - 1)
  await page.reload()
  await expect(page.getByText('Add a migration')).toBeHidden()
})

test('a failing request surfaces in the UI and can be dismissed', async ({ page }) => {
  await page.route('**/api/tasks*', (route) => route.abort('failed'))

  await page.goto('/')

  const alert = page.getByRole('alert')
  await expect(alert).toBeVisible()

  await page.getByRole('button', { name: 'dismiss' }).click()
  await expect(alert).toBeHidden()
})

test('the API rejects an invalid task through the Vite proxy', async ({ request }) => {
  const response = await request.post('/api/tasks', { data: { title: '   ' } })

  expect(response.status()).toBe(400)
  expect(await response.json()).toMatchObject({
    error: { code: 'validation_error' },
  })
})
