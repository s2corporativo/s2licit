# Integration Core

Use `CredentialResolver`, `ExternalHttpClient`, `IntegrationRegistry`, standard error/result contracts and explicit cache policies for every new external integration. Do not introduce a second retry client, mutable runtime `process.env`, silent `[]` fallbacks, or direct secret logging.
