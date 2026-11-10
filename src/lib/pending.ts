// A picture dropped or pasted on another page, on its way to the form that takes it.
let held: Blob | null = null
export const holdPicture = (file: Blob) => { held = file }
export const takePicture = () => { const file = held; held = null; return file }
