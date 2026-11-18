import { translate } from '$lib/i18n'
import { DATASET_LICENSE_URL, DATASET_NAME, DATASET_PUBLISHER, DATASET_VERSION, datasetCounts } from '$lib/server/export'
import { datasetData } from '$lib/structured-data'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ platform, params }) => {
  const db = platform?.env.DB
  const locale = params.locale
  const structured = datasetData({
    locale, name: DATASET_NAME, alternateName: translate('zh-Hant', 'app.name'), description: translate(locale, 'app.description'),
    license: DATASET_LICENSE_URL, publisher: DATASET_PUBLISHER, version: DATASET_VERSION,
    downloads: [
      { name: translate(locale, 'data.records'), format: 'json' },
      { name: translate(locale, 'data.evidence'), format: 'csv' },
      { name: translate(locale, 'data.media'), format: 'media' },
    ],
  })
  return { counts: db ? await datasetCounts(db) : { records: 0, evidence: 0 }, structured }
}
