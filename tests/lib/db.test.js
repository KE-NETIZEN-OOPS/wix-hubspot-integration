jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ _isMock: true })),
}))

beforeEach(() => { jest.resetModules() })

test('getDb returns a client', async () => {
  const { createClient } = require('@supabase/supabase-js')
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  const { getDb } = await import('../../src/lib/db.js')
  expect(getDb()._isMock).toBe(true)
  expect(createClient).toHaveBeenCalledTimes(1)
})

test('getDb returns same instance on second call', async () => {
  const { createClient } = require('@supabase/supabase-js')
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  const { getDb } = await import('../../src/lib/db.js')
  expect(getDb()).toBe(getDb())
  expect(createClient).toHaveBeenCalledTimes(1)
})
