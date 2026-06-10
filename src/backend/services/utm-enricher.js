const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'page_url', 'referrer']

export function extractUtmFields(formData) {
  return UTM_FIELDS.reduce((acc, key) => {
    if (key in formData && formData[key]) acc[key] = formData[key]
    return acc
  }, {})
}

export function buildAttributionProperties(utm, submittedAtMs) {
  const props = {
    original_source_url: utm.page_url,
    original_referrer: utm.referrer,
    first_form_submitted_at: new Date(submittedAtMs).toISOString(),
  }
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    if (utm[k] != null) props[k] = utm[k]
  }
  return props
}
