const store = {}
let _seq = 0

const wixData = {
  _store: store,
  _reset() { Object.keys(store).forEach(k => delete store[k]); _seq = 0 },

  query(collection) {
    const chain = {
      _filters: [],
      eq(field, value) { this._filters.push({ field, value }); return this },
      find() {
        const items = (store[collection] || []).filter(item =>
          chain._filters.every(f => item[f.field] === f.value)
        )
        return Promise.resolve({ items })
      },
    }
    return chain
  },

  insert(collection, item) {
    if (!store[collection]) store[collection] = []
    const saved = { ...item, _id: item._id || `mock_${Date.now()}_${++_seq}` }
    store[collection].push(saved)
    return Promise.resolve(saved)
  },

  update(collection, item) {
    const idx = (store[collection] || []).findIndex(i => i._id === item._id)
    if (idx === -1) return Promise.reject(new Error('Item not found'))
    store[collection][idx] = { ...store[collection][idx], ...item }
    return Promise.resolve(store[collection][idx])
  },

  remove(collection, id) {
    if (!store[collection]) return Promise.resolve()
    store[collection] = store[collection].filter(i => i._id !== id)
    return Promise.resolve()
  },
}

module.exports = wixData
