module.exports = {
  testEnvironment: 'node',
  moduleNameMapper: {
    '^wix-data$': '<rootDir>/tests/__mocks__/wix-data.js',
    '^wix-secrets-backend$': '<rootDir>/tests/__mocks__/wix-secrets-backend.js',
    '^wix-fetch$': '<rootDir>/tests/__mocks__/wix-fetch.js',
  },
  testMatch: ['**/tests/**/*.test.js'],
}
