const secrets = {}

module.exports = {
  _reset() { Object.keys(secrets).forEach(k => delete secrets[k]) },
  _set(name, value) { secrets[name] = { id: name, name, value } },

  getSecret: jest.fn(name => {
    if (!secrets[name]) return Promise.reject(new Error(`Secret "${name}" not found`))
    return Promise.resolve(secrets[name].value)
  }),

  listSecretInfo: jest.fn(() =>
    Promise.resolve(Object.values(secrets).map(({ id, name }) => ({ id, name })))
  ),

  createSecret: jest.fn(({ name, value }) => {
    secrets[name] = { id: name, name, value }
    return Promise.resolve({ id: name })
  }),

  updateSecret: jest.fn((id, { value }) => {
    const entry = Object.values(secrets).find(s => s.id === id)
    if (entry) entry.value = value
    return Promise.resolve()
  }),

  deleteSecret: jest.fn(id => {
    const key = Object.keys(secrets).find(k => secrets[k].id === id)
    if (key) delete secrets[key]
    return Promise.resolve()
  }),
}
