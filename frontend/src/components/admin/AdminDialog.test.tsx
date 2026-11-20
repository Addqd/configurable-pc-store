import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '../../test-utils'
import { AdminDialog, AdminDialogClose } from './AdminDialog'

function AllDisabledDialog({ onClose }: { onClose: () => void }) {
  return (
    <AdminDialog open onClose={onClose} labelledBy="disabled-dialog-title" widthClass="max-w-[420px]">
      <h2 id="disabled-dialog-title">Saving</h2>
      <button type="button" disabled>Save</button>
      <AdminDialogClose onClick={onClose} disabled />
    </AdminDialog>
  )
}

function EnabledDialog({ onClose }: { onClose: () => void }) {
  return (
    <AdminDialog open onClose={onClose} labelledBy="enabled-dialog-title" widthClass="max-w-[420px]">
      <h2 id="enabled-dialog-title">Editing</h2>
      <button type="button">First field</button>
      <button type="button">Last field</button>
      <AdminDialogClose onClick={onClose} />
    </AdminDialog>
  )
}

function StackedDialogs() {
  const [editorOpen, setEditorOpen] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(true)
  return (
    <>
      <AdminDialog open={editorOpen} onClose={() => setEditorOpen(false)} labelledBy="editor-title">
        <h2 id="editor-title">Editor</h2>
        <button type="button">Edit field</button>
        {confirmOpen && (
          <AdminDialog open onClose={() => setConfirmOpen(false)} labelledBy="confirm-title">
            <h2 id="confirm-title">Confirm deletion</h2>
            <button type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
          </AdminDialog>
        )}
      </AdminDialog>
      {editorOpen && <p>editor is open</p>}
    </>
  )
}

// jsdom has no layout, so `offsetParent` is always null and the dialog's own
// visibility filter would hide every control. Simulate attached elements.
const originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetParent')

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.isConnected ? this.parentElement : null },
  })
})

afterEach(() => {
  cleanup()
  if (originalOffsetParent) Object.defineProperty(HTMLElement.prototype, 'offsetParent', originalOffsetParent)
  else Reflect.deleteProperty(HTMLElement.prototype, 'offsetParent')
})

const focusedInside = (dialog: HTMLElement) => dialog.contains(document.activeElement)

describe('AdminDialog keyboard containment', () => {  it('focuses the panel and keeps Tab inside when every control is disabled', async () => {
    render(<><button type="button">outside</button><AllDisabledDialog onClose={() => {}} /></>)
    const panel = screen.getByRole('dialog')
    await waitFor(() => expect(document.activeElement).toBe(panel))

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Tab' })
    expect(document.activeElement).toBe(panel)

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(panel)
  })

  it('wraps focus between the first and last control', async () => {
    render(<EnabledDialog onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    await waitFor(() => expect(focusedInside(dialog)).toBe(true))

    const items = Array.from(dialog.querySelectorAll<HTMLElement>('button'))
    items[items.length - 1].focus()
    fireEvent.keyDown(items[items.length - 1], { key: 'Tab' })
    expect(document.activeElement).toBe(items[0])

    items[0].focus()
    fireEvent.keyDown(items[0], { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(items[items.length - 1])
  })

  it('pulls focus back into the dialog when it sits outside', async () => {
    render(<><button type="button">outside</button><EnabledDialog onClose={() => {}} /></>)
    const dialog = screen.getByRole('dialog')
    const outside = screen.getByRole('button', { name: 'outside' })
    outside.focus()
    expect(document.activeElement).toBe(outside)

    fireEvent.keyDown(outside, { key: 'Tab' })
    expect(focusedInside(dialog)).toBe(true)

    outside.focus()
    fireEvent.keyDown(outside, { key: 'Tab', shiftKey: true })
    expect(focusedInside(dialog)).toBe(true)
  })

  it('lets only the topmost stacked dialog handle Escape', async () => {
    render(<StackedDialogs />)
    expect(screen.getByRole('heading', { name: 'Confirm deletion' })).toBeTruthy()

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Confirm deletion' })).toBeNull())
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeTruthy()
    expect(screen.getByText('editor is open')).toBeTruthy()
  })

  it('closes on Escape and restores the previous focus', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>Open</button>
          {open && (
            <AdminDialog open onClose={() => setOpen(false)} labelledBy="restore-title">
              <h2 id="restore-title">Restore</h2>
              <button type="button">Inside</button>
            </AdminDialog>
          )}
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    await waitFor(() => expect(focusedInside(screen.getByRole('dialog'))).toBe(true))

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(opener)
  })
})

/** Dialog A is mounted first but stays closed; both can be opened from the page. */
function MountOrderHarness() {
  const [aOpen, setAOpen] = useState(false)
  const [bOpen, setBOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setBOpen(true)}>Open B</button>
      <button type="button" onClick={() => setAOpen(true)}>Open A</button>
      <AdminDialog open={aOpen} onClose={() => setAOpen(false)} labelledBy="a-title">
        <h2 id="a-title">Dialog A</h2>
        <button type="button">A action</button>
      </AdminDialog>
      <AdminDialog open={bOpen} onClose={() => setBOpen(false)} labelledBy="b-title">
        <h2 id="b-title">Dialog B</h2>
        <button type="button">B action</button>
      </AdminDialog>
    </>
  )
}

/** Editor dialog whose confirmation is opened from inside it. */
function NestedOpenerHarness() {
  const [editorOpen, setEditorOpen] = useState(true)
  const [confirmOpen, setConfirmOpen] = useState(false)
  return (
    <AdminDialog open={editorOpen} onClose={() => setEditorOpen(false)} labelledBy="editor-title">
      <h2 id="editor-title">Editor</h2>
      <button type="button" onClick={() => setConfirmOpen(true)}>Delete image</button>
      {confirmOpen && (
        <AdminDialog open onClose={() => setConfirmOpen(false)} labelledBy="confirm-title">
          <h2 id="confirm-title">Confirm deletion</h2>
          <button type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
        </AdminDialog>
      )}
    </AdminDialog>
  )
}

describe('AdminDialog opening order', () => {
  it('gives the keyboard to the dialog that opened last, not to the one mounted first', async () => {
    render(<MountOrderHarness />)
    fireEvent.click(screen.getByRole('button', { name: 'Open B' }))
    expect(await screen.findByRole('heading', { name: 'Dialog B' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open A' }))
    expect(await screen.findByRole('heading', { name: 'Dialog A' })).toBeTruthy()

    // A was mounted first but opened last: it is painted on top and owns Escape.
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Dialog A' })).toBeNull())
    expect(screen.getByRole('heading', { name: 'Dialog B' })).toBeTruthy()

    // Closing the topmost dialog hands the keyboard back to the one below it.
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Dialog B' })).toBeNull())
  })

  it('focuses only the topmost dialog when two open in the same commit', async () => {
    render(<StackedDialogs />)
    const confirm = await screen.findByRole('heading', { name: 'Confirm deletion' })
    const confirmDialog = confirm.closest('[role="dialog"]') as HTMLElement
    const editorDialog = screen.getByRole('heading', { name: 'Editor' }).closest('[role="dialog"]') as HTMLElement

    await waitFor(() => expect(confirmDialog.contains(document.activeElement)).toBe(true))
    // The dialog underneath must not pull focus back while the child is open.
    expect(editorDialog.contains(document.activeElement)).toBe(false)

    // Tab containment belongs to the topmost dialog as well.
    const buttons = Array.from(confirmDialog.querySelectorAll<HTMLElement>('button'))
    buttons[buttons.length - 1].focus()
    fireEvent.keyDown(buttons[buttons.length - 1], { key: 'Tab' })
    expect(confirmDialog.contains(document.activeElement)).toBe(true)
    expect(editorDialog.contains(document.activeElement)).toBe(false)
  })

  it('restores focus inside the parent dialog when the nested dialog closes', async () => {
    render(<NestedOpenerHarness />)
    const opener = screen.getByRole('button', { name: 'Delete image' })
    opener.focus()
    fireEvent.click(opener)
    expect(await screen.findByRole('heading', { name: 'Confirm deletion' })).toBeTruthy()

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Confirm deletion' })).toBeNull())
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeTruthy()
    expect(document.activeElement).toBe(opener)
  })

  it('keeps the page scroll locked until the last dialog closes', async () => {
    render(<NestedOpenerHarness />)
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Delete image' }))
    expect(await screen.findByRole('heading', { name: 'Confirm deletion' })).toBeTruthy()
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Confirm deletion' })).toBeNull())
    // The editor is still open, so the page must stay locked.
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.body.style.overflow).toBe('')
  })

  it('releases the scroll lock when an open dialog unmounts', async () => {
    const { unmount } = render(<NestedOpenerHarness />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('')
    expect(document.querySelectorAll('[data-admin-dialog-root]')).toHaveLength(0)
  })

  it('keeps focus on the panel of the topmost dialog when every control is disabled', async () => {
    render(
      <>
        <AllDisabledDialog onClose={() => {}} />
        <AdminDialog open onClose={() => {}} labelledBy="top-title" widthClass="max-w-[420px]">
          <h2 id="top-title">Top</h2>
          <button type="button">Top action</button>
        </AdminDialog>
      </>,
    )
    const top = (await screen.findByRole('heading', { name: 'Top' })).closest('[role="dialog"]') as HTMLElement
    await waitFor(() => expect(top.contains(document.activeElement)).toBe(true))

    // The disabled dialog underneath never regains control.
    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    expect(screen.getByRole('heading', { name: 'Top' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Saving' })).toBeTruthy()
  })
})
