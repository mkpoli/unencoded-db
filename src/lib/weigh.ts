import { PICTURES_BODY_MAX } from './limits'

/** Whether the files a form holds weigh more than the server takes, leaving room for the rest of it. */
export const overweight = (form: HTMLFormElement) =>
  [...form.querySelectorAll<HTMLInputElement>('input[type=file]')].flatMap(input => [...(input.files ?? [])]).reduce((sum, file) => sum + file.size, 0) > PICTURES_BODY_MAX - 1024 * 1024
