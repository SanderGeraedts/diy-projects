import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UpdateBar } from './UpdateBar'

describe('UpdateBar', () => {
  afterEach(cleanup)

  it('shows nothing without a new version', () => {
    const { container } = render(<UpdateBar state={{ status: 'none' }} onApply={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('offers the new version and applies it on a tap', () => {
    const onApply = vi.fn()
    render(<UpdateBar state={{ status: 'available' }} onApply={onApply} />)
    expect(screen.getByText('Nieuwe versie beschikbaar')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Bijwerken' }))
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('says what it waits for', () => {
    render(
      <UpdateBar state={{ status: 'waiting', reasons: ['de foto-import', 'de synchronisatie'] }} onApply={() => {}} />,
    )
    expect(screen.getByText('Bijwerken zodra de foto-import en de synchronisatie klaar is…')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
