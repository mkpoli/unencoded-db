/** The largest image the upload and source-link paths accept. */
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024
/** The most pictures one sighting holds. */
export const MEDIA_MAX = 8
/** The most characters one batch holds: the number of adds a rate window allows. */
export const BATCH_ROWS_MAX = 10
/** The most sightings a new record starts with. Each one after the first takes one more add from the rate
 * window, and the pictures of all of them travel in one request. */
export const ADD_SIGHTINGS_MAX = 5
/** The most a form of several pictures weighs: a batch, or a new record with its sightings. The request is
 * held in memory, so the whole body stays under this ceiling; each picture still has its own limit. */
export const PICTURES_BODY_MAX = 32 * 1024 * 1024
/** The most marks one picture holds. */
export const BOXES_MAX = 8
