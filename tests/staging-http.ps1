$ErrorActionPreference='Stop'
$base='https://bakery-empire-staging.miloserdovfeed.workers.dev'
$cases=@(
 @{Path='/api/save';Method='GET';Headers=@{};Expected=401},
 @{Path='/api/save';Method='PUT';Headers=@{};Expected=401},
 @{Path='/api/save';Method='GET';Headers=@{Authorization='tma user=123&signature=fake'};Expected=401},
 @{Path='/api/save';Method='GET';Headers=@{Origin='https://example.com'};Expected=403},
 @{Path='/webhook';Method='POST';Headers=@{};Expected=404},
 @{Path='/api/invoice';Method='POST';Headers=@{};Expected=404}
)
foreach($case in $cases){$r=Invoke-WebRequest ($base+$case.Path) -Method $case.Method -Headers $case.Headers -SkipHttpErrorCheck -TimeoutSec 15;if($r.StatusCode -ne $case.Expected){throw "Unexpected HTTP status for $($case.Path): $($r.StatusCode)"}}
$r=Invoke-WebRequest ($base+'/cloud-saves.js') -TimeoutSec 15
if(!$r.Content.Contains($base+'/api/save') -or $r.Content.Contains('https://bakery-empire-bot.')){throw 'Frontend endpoint mismatch'}
Write-Output 'PASS real staging HTTP: anonymous/forged denied, origin restricted, webhook/payment absent, frontend isolated. No successful signed requests simulated.'
