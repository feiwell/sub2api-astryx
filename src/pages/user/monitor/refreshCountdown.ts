import { createContext } from 'react'

/**
 * The seconds until the page refreshes by itself; null while it does not. Each card shows it, and reads it
 * from here: handed down as a property it would draw every card anew each second.
 */
export const RefreshCountdown = createContext<number | null>(null)
