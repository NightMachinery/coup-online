import { useContext } from 'react'
import { DisplayNameContext } from '../contexts/DisplayNameContext'

export function useDisplayName() {
  return useContext(DisplayNameContext)
}
