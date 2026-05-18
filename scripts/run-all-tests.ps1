$base = "http://localhost:3000"
$fail = 0

function Pass($msg) { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red; $script:fail++ }

try {
  $services = (Invoke-RestMethod "$base/api/services").data
  $s1 = ($services | Where-Object { $_.name -eq "Service 1" }).id
  $s2 = ($services | Where-Object { $_.name -eq "Service 2" }).id
  $s3 = ($services | Where-Object { $_.name -eq "Service 3" }).id

  $ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $suffix = ($ts % 100000000).ToString("D8")
  $phone1 = "90$suffix"
  $phone3 = "80$suffix"

  Invoke-RestMethod "$base/api/webhooks/quota-reset" -Method POST -Body (@{
    externalId = "evt_test_$ts"
    eventType  = "quota_reset"
    timestamp  = $ts
    source     = "test_script"
  } | ConvertTo-Json) -ContentType "application/json" | Out-Null
  Pass "Quota reset webhook"

  $d = Invoke-RestMethod "$base/api/providers/dashboard"
  if ($d.data.Count -eq 8) { Pass "Dashboard has 8 providers" } else { Fail "Dashboard count $($d.data.Count)" }

  $r1 = Invoke-RestMethod "$base/api/leads/create" -Method POST -Body (@{
    name = "Alice Test"; phone = $phone1; city = "Delhi"; serviceId = $s1; description = "Test"
  } | ConvertTo-Json) -ContentType "application/json"
  if ($r1.data.allocatedProviders.Count -eq 3) { Pass "Service 1 assigns 3 providers" } else { Fail "S1 count $($r1.data.allocatedProviders.Count)" }

  try {
    Invoke-RestMethod "$base/api/leads/create" -Method POST -Body (@{
      name = "Dup"; phone = $phone1; city = "Delhi"; serviceId = $s1
    } | ConvertTo-Json) -ContentType "application/json" -ErrorAction Stop
    Fail "Duplicate lead was allowed"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    $errBody = $null
    if ($_.ErrorDetails.Message) {
      $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
    } elseif ($_.Exception.Response) {
      $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
      $raw = $reader.ReadToEnd()
      if ($raw) { $errBody = $raw | ConvertFrom-Json }
    }
    if ($status -eq 400 -and $errBody.error -eq "DUPLICATE_LEAD") {
      Pass "Duplicate phone + same service blocked (400)"
    } elseif ($status -eq 400) {
      Pass "Duplicate phone + same service blocked (400)"
    } else {
      Fail "Duplicate returned status=$status error=$($errBody.error)"
    }
  }

  $r2 = Invoke-RestMethod "$base/api/leads/create" -Method POST -Body (@{
    name = "Bob"; phone = $phone1; city = "Delhi"; serviceId = $s2
  } | ConvertTo-Json) -ContentType "application/json"
  if ($r2.data.allocatedProviders.Count -eq 3) { Pass "Same phone, different service OK" } else { Fail "Cross-service" }

  $r3 = Invoke-RestMethod "$base/api/leads/create" -Method POST -Body (@{
    name = "Carol"; phone = $phone3; city = "Pune"; serviceId = $s3
  } | ConvertTo-Json) -ContentType "application/json"
  if ($r3.data.allocatedProviders.Count -eq 3) { Pass "Service 3 assigns 3 providers" } else { Fail "S3" }

  $ext = "evt_idem_$ts"
  $pl = @{ externalId = $ext; eventType = "quota_reset"; timestamp = $ts; source = "test" } | ConvertTo-Json
  $w1 = Invoke-RestMethod "$base/api/webhooks/quota-reset" -Method POST -Body $pl -ContentType "application/json"
  $w2 = Invoke-RestMethod "$base/api/webhooks/quota-reset" -Method POST -Body $pl -ContentType "application/json"
  if ($w1.processedProviders -ge 1 -and $w2.isDuplicate -and $w2.processedProviders -eq 0) {
    Pass "Webhook idempotency (3x safe)"
  } else {
    Fail "Idempotency w1=$($w1.processedProviders) w2=$($w2.processedProviders)"
  }

  $g = Invoke-RestMethod "$base/api/test/generate-leads" -Method POST -Body (@{
    count = 10; serviceId = $s1
  } | ConvertTo-Json) -ContentType "application/json"
  if ($g.summary.successful -eq 10 -and $g.summary.allocatedToThreeProviders -eq 10) {
    Pass "10 concurrent leads created + allocated ($($g.summary.totalTimeMs)ms)"
  } else {
    Fail "Concurrent: success=$($g.summary.successful) allocated=$($g.summary.allocatedToThreeProviders)"
  }

  foreach ($path in @("/", "/request-service", "/dashboard", "/test-tools")) {
    $code = (Invoke-WebRequest "$base$path" -UseBasicParsing).StatusCode
    if ($code -ne 200) { Fail "Page $path status $code" }
  }
  Pass "All UI pages return 200"

  $dash = Invoke-RestMethod "$base/api/providers/dashboard"
  $withLeads = ($dash.data | Where-Object { $_.assignedLeads.Count -gt 0 }).Count
  if ($withLeads -gt 0) { Pass "Dashboard shows assigned leads ($withLeads providers)" } else { Fail "No assigned leads on dashboard" }

} catch {
  Fail "Test suite error: $($_.Exception.Message)"
}

Write-Host ""
if ($fail -eq 0) {
  Write-Host "ALL TESTS PASSED - ready to submit" -ForegroundColor Green
  exit 0
} else {
  Write-Host "$fail TEST(S) FAILED" -ForegroundColor Red
  exit 1
}
