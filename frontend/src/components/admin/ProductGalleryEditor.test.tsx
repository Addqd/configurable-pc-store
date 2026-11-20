import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '../../i18n'
import { ProductGalleryEditor } from './ProductGalleryEditor'

const droppedFile = () => new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' })
const fileTransfer = (files: File[]) => ({ files, types: ['Files'] })

function setup(overrides: Partial<React.ComponentProps<typeof ProductGalleryEditor>> = {}) {
  const onAddFiles = vi.fn()
  const onReorder = vi.fn()
  const view = render(
    <ProductGalleryEditor
      items={[]}
      onAddFiles={onAddFiles}
      onRemove={vi.fn()}
      onReorder={onReorder}
      {...overrides}
    />,
  )
  const zone = view.container.querySelector('[data-gallery-dropzone]') as HTMLElement
  return { onAddFiles, onReorder, zone }
}

afterEach(cleanup)

describe('product gallery external file drop', () => {
  it('accepts files dragged from the operating system', () => {
    const { onAddFiles, zone } = setup()
    const file = droppedFile()

    fireEvent.dragEnter(zone, { dataTransfer: fileTransfer([file]) })
    fireEvent.dragOver(zone, { dataTransfer: fileTransfer([file]) })
    fireEvent.drop(zone, { dataTransfer: fileTransfer([file]) })

    expect(onAddFiles).toHaveBeenCalledTimes(1)
    expect(onAddFiles.mock.calls[0]?.[0]).toEqual([file])
  })

  it('highlights the drop area while files hover over it', () => {
    const { zone } = setup()
    const file = droppedFile()

    expect(screen.getByText(/попробуйте перетаскивать картинки/)).toBeTruthy()
    fireEvent.dragEnter(zone, { dataTransfer: fileTransfer([file]) })
    expect(zone.className).toContain('border-primary')
    expect(screen.getByText('Отпустите файлы, чтобы добавить их в галерею')).toBeTruthy()

    fireEvent.dragLeave(zone, { dataTransfer: fileTransfer([file]) })
    expect(zone.className).not.toContain('border-primary')
  })

  it('does not treat internal image reordering as a file drop', () => {
    const { onAddFiles, zone } = setup()
    fireEvent.dragEnter(zone, { dataTransfer: { files: [], types: ['text/plain'] } })
    fireEvent.drop(zone, { dataTransfer: { files: [], types: ['text/plain'] } })
    expect(onAddFiles).not.toHaveBeenCalled()
  })

  it('ignores external files when the gallery is disabled', () => {
    const { onAddFiles, zone } = setup({ disabled: true })
    fireEvent.drop(zone, { dataTransfer: fileTransfer([droppedFile()]) })
    expect(onAddFiles).not.toHaveBeenCalled()
  })

  it('still reorders existing images by dragging', () => {
    const items = [
      { key: 'a', id: 1, url: '/a.png' },
      { key: 'b', id: 2, url: '/b.png' },
    ]
    const { onReorder, zone } = setup({ items })
    const tiles = zone.querySelectorAll('[data-gallery-index]')
    fireEvent.dragStart(tiles[0] as HTMLElement, { dataTransfer: { files: [], types: [] } })
    fireEvent.drop(tiles[1] as HTMLElement, { dataTransfer: { files: [], types: [] } })
    expect(onReorder).toHaveBeenCalledWith(0, 1)
  })
})
