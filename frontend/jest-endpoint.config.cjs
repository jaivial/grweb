module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/endpoints'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.jest.json'
    }]
  },
  testTimeout: 30000,
};
