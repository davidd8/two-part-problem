import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Tests import their globals explicitly (globals: false), so React Testing
// Library's automatic cleanup does not register itself. Do it here.
afterEach(cleanup)
