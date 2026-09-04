# Run after `npm run provision:cloud`.
# Wrangler prompts securely for each value; secrets are not written to wrangler.jsonc.
$secrets = @(
  "DEVICE_TOKEN",
  "GEMINI_API_KEY",
  "POWER_AUTOMATE_BACKUP_URL",
  "POWER_AUTOMATE_BACKUP_KEY"
)

foreach ($secret in $secrets) {
  Write-Host ""
  Write-Host "Configuring Cloudflare Worker secret: $secret" -ForegroundColor Cyan
  npx wrangler secret put $secret
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
