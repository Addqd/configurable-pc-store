import { defineConfig } from 'orval'

export default defineConfig({
  api: {
    input: 'http://127.0.0.1:8000/openapi.json',
    output: {
      target: './src/api/generated/client.ts',
      schemas: { path: './src/api/generated/model', type: 'zod' },
      client: 'react-query',
      httpClient: 'fetch',
      override: {
        zod: { version: 4 },
        fetch: { runtimeValidation: true, includeHttpResponseReturnType: false },
        includeZodSchemaInArguments: true,
        mutator: { path: './src/api/transport.ts', name: 'apiFetch' },
      },
    },
  },
})
