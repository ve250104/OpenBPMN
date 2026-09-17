$ErrorActionPreference = 'Stop'

# Invoke only the private runtime from this extracted platform bundle.
$bundleRoot = $PSScriptRoot
$privateRuntime = Join-Path $bundleRoot 'runtime/node.exe'
$management = Join-Path $bundleRoot 'app/dist/manage.js'

if (!(Test-Path -LiteralPath $privateRuntime -PathType Leaf) -or !(Test-Path -LiteralPath $management -PathType Leaf)) {
    [Console]::Error.WriteLine('Incomplete BPMN Weave bundle: extract the complete platform archive before running setup.')
    exit 2
}

$previousNodeOptions = $env:NODE_OPTIONS
$previousNodePath = $env:NODE_PATH
$weaveSetupExit = 1
try {
    $env:NODE_OPTIONS = $null
    $env:NODE_PATH = $null
    & $privateRuntime $management setup --bundle $bundleRoot @args
    $weaveSetupExit = $LASTEXITCODE
} finally {
    $env:NODE_OPTIONS = $previousNodeOptions
    $env:NODE_PATH = $previousNodePath
}
exit $weaveSetupExit
