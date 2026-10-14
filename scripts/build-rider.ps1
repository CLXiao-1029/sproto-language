param(
    [string]$RiderHome = 'C:/Program Files/JetBrains/JetBrains Rider 2025.2.5'
)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path $PSScriptRoot -Parent
$releaseMetadata = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'plugin-release.json') | ConvertFrom-Json
[xml]$pluginMetadata = Get-Content -Raw -LiteralPath (Join-Path $taskRoot 'rider/src/main/resources/META-INF/plugin.xml')
if ($pluginMetadata.'idea-plugin'.version -ne $releaseMetadata.version -or $pluginMetadata.'idea-plugin'.vendor -ne $releaseMetadata.author) {
    throw 'Rider version and vendor must match plugin-release.json.'
}
$sdkPath = (Resolve-Path -LiteralPath $RiderHome).Path
$jdkCompiler = Join-Path $sdkPath 'jbr/bin/javac.exe'
$jdkJava = Join-Path $sdkPath 'jbr/bin/java.exe'
if (!(Test-Path -LiteralPath $jdkCompiler)) { throw 'RiderHome must contain a JDK with jbr/bin/javac.exe.' }
$product = Get-Content -Raw -LiteralPath (Join-Path $sdkPath 'product-info.json') | ConvertFrom-Json
if ($product.productCode -ne 'RD' -or !$product.buildNumber.StartsWith('252.')) {
    throw 'This release targets Rider 2025.2 (build 252). Use that SDK to build and test.'
}
$classPath = (Get-ChildItem -LiteralPath (Join-Path $sdkPath 'lib') -Filter '*.jar' | ForEach-Object FullName) -join [IO.Path]::PathSeparator
$buildPath = Join-Path $taskRoot 'build/rider'
$classes = Join-Path $buildPath 'classes'
$testClasses = Join-Path $buildPath 'test-classes'
$stage = Join-Path $buildPath 'package/sproto-language/lib'
$dist = Join-Path $taskRoot 'dist'
New-Item -ItemType Directory -Force -Path $classes,$testClasses,$stage,$dist | Out-Null
$sources = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'rider/src/main/java') -Filter '*.java' -Recurse | ForEach-Object FullName)
& $jdkCompiler -encoding UTF-8 --release 21 -cp $classPath -d $classes @sources
if ($LASTEXITCODE -ne 0) { throw 'Rider plugin compilation failed.' }
$testSources = @(Get-ChildItem -LiteralPath (Join-Path $taskRoot 'rider/src/test/java') -Filter '*.java' -Recurse | ForEach-Object FullName)
& $jdkCompiler -encoding UTF-8 --release 21 -cp "$classes;$classPath" -d $testClasses @testSources
if ($LASTEXITCODE -ne 0) { throw 'Rider test compilation failed.' }
& $jdkJava -cp "$classes;$testClasses;$classPath" dev.sproto.ModelTest (Join-Path $taskRoot 'Test/Proto.sproto')
if ($LASTEXITCODE -ne 0) { throw 'Rider model tests failed.' }
& $jdkJava -cp "$classes;$testClasses;$classPath" dev.sproto.SdkSmokeTest (Join-Path $taskRoot 'rider/src/main/resources/META-INF/plugin.xml')
if ($LASTEXITCODE -ne 0) { throw 'Rider SDK smoke tests failed.' }
$jarPath = Join-Path $stage 'sproto-language.jar'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path -LiteralPath $jarPath) { Remove-Item -LiteralPath $jarPath }
$jarArchive = [IO.Compression.ZipFile]::Open($jarPath, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($sourceRoot in @($classes, (Join-Path $taskRoot 'rider/src/main/resources'))) {
        foreach ($sourceFile in Get-ChildItem -LiteralPath $sourceRoot -File -Recurse) {
            $entryName = $sourceFile.FullName.Substring($sourceRoot.Length + 1).Replace('\', '/')
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($jarArchive, $sourceFile.FullName, $entryName) | Out-Null
        }
    }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($jarArchive, (Join-Path $taskRoot 'rider/README.md'), 'README.md') | Out-Null
} finally { $jarArchive.Dispose() }
$zipPath = Join-Path $dist ('sproto-rider-{0}.zip' -f $releaseMetadata.version)
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath }
[IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $buildPath 'package'), $zipPath)
Write-Output "Rider package: $zipPath"
