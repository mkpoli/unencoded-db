import { prepare, thumbnail, type Box, type Prepared } from './picture'

type State = { picture: Prepared | null; box: Box | null; thumb: File | null; busy: boolean; bad: boolean; thumbnailBad: boolean }
type Processing = { prepare: typeof prepare; thumbnail: typeof thumbnail }

export function preventPendingSubmit(event: Event, busy: boolean) {
  if (!busy) return
  event.preventDefault()
  event.stopImmediatePropagation()
}

export function beginPointerBox(picker: PicturePickerState, stage: Pick<HTMLElement, 'setPointerCapture' | 'releasePointerCapture'>, event: Pick<PointerEvent, 'isPrimary' | 'button' | 'pointerId' | 'preventDefault'>) {
  if (!event.isPrimary || event.button !== 0) return null
  try { stage.setPointerCapture(event.pointerId) } catch { return null }
  const generation = picker.beginBox()
  if (generation === null) {
    try { stage.releasePointerCapture(event.pointerId) } catch { /* Capture was already lost. */ }
    return null
  }
  event.preventDefault()
  return generation
}

// Only the latest selection or crop may publish its result or release the submit gate.
export class PicturePickerState {
  private state: State = { picture: null, box: null, thumb: null, busy: false, bad: false, thumbnailBad: false }
  private generation = 0
  private preparing = false
  private disposed = false
  private drawing: number | null = null
  private saved: { box: Box | null; thumb: File | null } = { box: null, thumb: null }

  constructor(private publish: (state: State) => void, private processing: Processing = { prepare, thumbnail }) {}

  private update(change: Partial<State>) {
    this.state = { ...this.state, ...change }
    this.publish(this.state)
  }

  private current(generation: number) { return !this.disposed && generation === this.generation }

  async take(source: Blob) {
    const generation = ++this.generation
    this.preparing = true
    this.update({ busy: true, bad: false, thumbnailBad: false, thumb: null })
    try {
      const picture = await this.processing.prepare(source)
      if (!this.current(generation)) return
      this.preparing = false
      this.saved = { box: null, thumb: null }
      this.update({ picture, box: null })
      await this.makeThumbnail(picture, null, generation)
    } catch {
      if (this.current(generation)) this.fail()
    }
  }

  beginBox(): number | null {
    if (!this.state.picture || this.preparing) return null
    const generation = ++this.generation
    this.drawing = generation
    this.update({ box: null, thumb: null, busy: true, bad: false, thumbnailBad: false })
    return generation
  }

  moveBox(generation: number, box: Box) {
    if (this.current(generation) && this.drawing === generation) this.update({ box })
  }

  async endBox(generation: number) {
    const picture = this.state.picture
    if (!picture || !this.current(generation) || this.drawing !== generation) return
    this.drawing = null
    let box = this.state.box
    if (box && (box[2] < 4 || box[3] < 4)) box = null
    this.update({ box })
    await this.makeThumbnail(picture, box, generation)
  }

  async clearBox() {
    const picture = this.state.picture
    if (!picture || this.preparing) return
    const generation = ++this.generation
    this.update({ box: null, thumb: null, busy: true, bad: false, thumbnailBad: false })
    await this.makeThumbnail(picture, null, generation)
  }

  private async makeThumbnail(picture: Prepared, box: Box | null, generation: number) {
    try {
      const thumb = await this.processing.thumbnail(picture.bitmap, box)
      if (this.current(generation)) {
        this.saved = { box, thumb }
        this.update({ thumb, busy: false })
      }
    } catch {
      if (this.current(generation)) this.update({ ...this.saved, busy: false, bad: true, thumbnailBad: true })
    }
  }

  clear() {
    ++this.generation
    this.preparing = false
    this.update({ picture: null, box: null, thumb: null, busy: false, bad: false, thumbnailBad: false })
  }

  private fail() {
    this.clear()
    this.update({ bad: true })
  }

  dispose() { this.disposed = true; ++this.generation }
}
