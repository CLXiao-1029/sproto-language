$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$releaseMetadata = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'plugin-release.json') | ConvertFrom-Json
$extensionMetadata = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'vscode/package.json') | ConvertFrom-Json
if ($releaseMetadata.version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
    throw 'Plugin version must use major.minor.patch format. Routine fixes increment patch.'
}
if ($extensionMetadata.version -ne $releaseMetadata.version -or $extensionMetadata.author -ne $releaseMetadata.author -or $extensionMetadata.publisher -ne $releaseMetadata.author) {
    throw 'VS Code version, author and publisher must match plugin-release.json.'
}
& node --test (Join-Path $taskRoot 'vscode/test/core.test.js') (Join-Path $taskRoot 'vscode/test/extension.test.js') (Join-Path $taskRoot 'vscode/test/colors.test.js')
if ($LASTEXITCODE -ne 0) { throw 'VS Code tests failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dist = Join-Path $taskRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$packagePath = Join-Path $dist ('sproto-vscode-{0}.vsix' -f $releaseMetadata.version)
if (Test-Path -LiteralPath $packagePath) { Remove-Item -LiteralPath $packagePath }
$zip = [IO.Compression.ZipFile]::Open($packagePath, [IO.Compression.ZipArchiveMode]::Create)
function Write-ZipText([string]$name, [string]$text) {
    $entry = $zip.CreateEntry($name)
    $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
    try { $writer.Write($text) } finally { $writer.Dispose() }
}
try {
    Write-ZipText '[Content_Types].xml' '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="txt" ContentType="text/plain"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>'
    Write-ZipText 'extension.vsixmanifest' @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="$($extensionMetadata.name)" Version="$($extensionMetadata.version)" Publisher="$($extensionMetadata.publisher)"/>
    <DisplayName>Sproto Language</DisplayName>
    <Description xml:space="preserve">Sproto language support for VS Code: scoped type navigation, completion, diagnostics and configurable semantic colors.</Description>
    <Tags>sproto,language</Tags><Categories>Programming Languages</Categories><GalleryFlags>Public</GalleryFlags>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.85.0"/><Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value=""/><Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value=""/></Properties>
    <License>extension/LICENSE.txt</License>
    <Icon>extension/$($extensionMetadata.icon)</Icon>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets><Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/$($extensionMetadata.icon)" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE.txt" Addressable="true"/></Assets>
</PackageManifest>
"@
    $extensionRoot = (Resolve-Path -LiteralPath (Join-Path $taskRoot 'vscode')).Path
    $extensionFiles = @('package.json','README.md','images/icon.png','images/logo.png','language-configuration.json','src/core.js','src/extension.js','src/colors.js','syntaxes/sproto.tmLanguage.json','snippets/sproto.json')
    foreach ($relative in $extensionFiles) {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $extensionRoot $relative), "extension/$relative") | Out-Null
    }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $taskRoot 'LICENSE'), 'extension/LICENSE.txt') | Out-Null
} finally { $zip.Dispose() }
Write-Output "VS Code package: $packagePath"
