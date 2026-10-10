$ErrorActionPreference = 'Continue'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
. (Join-Path $PSScriptRoot 'refresh-path.ps1')
$global:AgentrixSession = Get-Content -LiteralPath $env:AGENTRIX_BOOTSTRAP -Raw -Encoding UTF8 | ConvertFrom-Json
$global:AgentrixEventSequence = 0
# agent.ps1 (Command Prompt terminals) loads only the codex and claude wrappers below and keeps its own directory.
$global:AgentrixAgentOnly = $env:AGENTRIX_AGENT_ONLY -eq '1'
if (-not $global:AgentrixAgentOnly) { Set-Location -LiteralPath $global:AgentrixSession.projectPath }
$global:AgentrixCodexCommand = Get-Command codex -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
$global:AgentrixCodexExecutable = $global:AgentrixCodexCommand
$global:AgentrixCodexPrefix = @()
if ($global:AgentrixCodexCommand -and [IO.Path]::GetExtension($global:AgentrixCodexCommand) -in @('.ps1', '.cmd')) {
    $npmEntry = Join-Path (Split-Path $global:AgentrixCodexCommand -Parent) 'node_modules\@openai\codex\bin\codex.js'
    $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
    if ((Test-Path -LiteralPath $npmEntry) -and $nodeCommand) {
        $global:AgentrixCodexExecutable = $nodeCommand
        $global:AgentrixCodexPrefix = @($npmEntry)
    }
}

$global:AgentrixClaudeCommand = Get-Command claude -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
$global:AgentrixClaudeExecutable = $global:AgentrixClaudeCommand
if ($global:AgentrixClaudeCommand -and [IO.Path]::GetExtension($global:AgentrixClaudeCommand) -in @('.ps1', '.cmd', '')) {
    $nativeClaude = Join-Path (Split-Path $global:AgentrixClaudeCommand -Parent) 'node_modules\@anthropic-ai\claude-code\bin\claude.exe'
    if (Test-Path -LiteralPath $nativeClaude) { $global:AgentrixClaudeExecutable = $nativeClaude }
}

# Windows PowerShell 5 strips embedded quotes when forwarding native arguments.
# Build the standard Windows argv representation explicitly so notify's TOML
# array, Chinese paths, quotes and trailing backslashes reach Codex intact.
function global:ConvertTo-AgentrixArgument {
    param([string]$Value)
    $builder = [Text.StringBuilder]::new()
    [void]$builder.Append([char]34)
    $slashes = 0
    foreach ($character in $Value.ToCharArray()) {
        if ($character -eq [char]92) { $slashes++; continue }
        if ($character -eq [char]34) {
            [void]$builder.Append(([string][char]92) * ($slashes * 2 + 1))
        } else {
            [void]$builder.Append(([string][char]92) * $slashes)
        }
        [void]$builder.Append($character)
        $slashes = 0
    }
    [void]$builder.Append(([string][char]92) * ($slashes * 2))
    [void]$builder.Append([char]34)
    return $builder.ToString()
}

function global:Send-AgentrixEvent {
    param([string]$Type, [int]$ExitCode = 0, [string]$Agent = 'codex')
    $global:AgentrixEventSequence++
    try {
        $eventData = @{
            projectId = $global:AgentrixSession.projectId
            sessionKey = $global:AgentrixSession.sessionKey
            type = $Type
            sequence = $global:AgentrixEventSequence
            exitCode = $ExitCode
            agent = $Agent
            codexAvailable = [bool]$global:AgentrixCodexCommand
            claudeAvailable = [bool]$global:AgentrixClaudeCommand
            codexHome = $(if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex' })
            cwd = (Get-Location).Path
        } | ConvertTo-Json -Compress
        $pipe = [System.IO.Pipes.NamedPipeClientStream]::new('.', $global:AgentrixSession.pipeName, [System.IO.Pipes.PipeDirection]::Out)
        try {
            $pipe.Connect(750)
            $writer = [System.IO.StreamWriter]::new($pipe, [System.Text.UTF8Encoding]::new($false))
            try { $writer.WriteLine($eventData); $writer.Flush() } finally { $writer.Dispose() }
        } finally { $pipe.Dispose() }
    } catch { }
}

function global:codex {
    if (-not $global:AgentrixCodexCommand) {
        Write-Host 'Codex CLI was not found in PATH. Install it, then restart this terminal.' -ForegroundColor Yellow
        return
    }
    $forwardArgs = @($args)
    $notifyCommand = @(
        $global:AgentrixSession.powershellPath,
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', $global:AgentrixSession.notifyPath,
        '-PipeName', $global:AgentrixSession.pipeName,
        '-ProjectId', $global:AgentrixSession.projectId,
        '-SessionKey', $global:AgentrixSession.sessionKey
    ) | ConvertTo-Json -Compress
    Send-AgentrixEvent 'codex-started'
    $codexExit = 0
    try {
        if ([IO.Path]::GetExtension($global:AgentrixCodexExecutable) -ne '.exe') {
            throw 'Use a native Codex executable or the standard npm installation of Codex.'
        }
        # What the reading view can show (electron/features/agents/reading-note.cjs); the user's own -c comes later and wins.
        $readingNote = if ($env:AGENTRIX_READING_NOTE) { @('-c', ('developer_instructions="' + $env:AGENTRIX_READING_NOTE + '"')) } else { @() }
        $nativeArgs = @($global:AgentrixCodexPrefix) + @('-c', ('notify=' + $notifyCommand), '-c', 'tui.terminal_title=["session-id"]') + $readingNote + $forwardArgs
        $startInfo = [Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $global:AgentrixCodexExecutable
        $startInfo.Arguments = (($nativeArgs | ForEach-Object { ConvertTo-AgentrixArgument ([string]$_) }) -join ' ')
        $startInfo.UseShellExecute = $false
        $startInfo.WorkingDirectory = (Get-Location).Path
        $codexProcess = [Diagnostics.Process]::Start($startInfo)
        try { $codexProcess.WaitForExit(); $codexExit = $codexProcess.ExitCode }
        finally { $codexProcess.Dispose() }
    } catch {
        Write-Error $_
        $codexExit = 1
    } finally {
        Send-AgentrixEvent 'codex-exited' $codexExit
        $global:LASTEXITCODE = $codexExit
    }
}

# Claude Code reports each turn through hooks injected with --settings, which merge with the
# user's own settings instead of replacing them. Depending on the installation Claude runs hook
# commands through PowerShell or Git Bash, so the command must mean the same in both: the
# executable path has no spaces and stays unquoted (a quoted first word is only a string in
# PowerShell), arguments are quoted, and every path uses forward slashes.
function global:claude {
    if (-not $global:AgentrixClaudeExecutable -or [IO.Path]::GetExtension($global:AgentrixClaudeExecutable) -ne '.exe') {
        if ($global:AgentrixClaudeCommand) { & $global:AgentrixClaudeCommand @args; return }
        Write-Host 'Claude Code was not found in PATH. Install it, then restart this terminal.' -ForegroundColor Yellow
        return
    }
    $hookCommand = @(
        ($global:AgentrixSession.powershellPath -replace '\\', '/'),
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', ('"' + ($global:AgentrixSession.claudeHookPath -replace '\\', '/') + '"'),
        '-PipeName', $global:AgentrixSession.pipeName,
        '-ProjectId', $global:AgentrixSession.projectId,
        '-SessionKey', $global:AgentrixSession.sessionKey
    ) -join ' '
    $hook = { param($kind) @{ hooks = @(@{ type = 'command'; command = ($hookCommand + ' -Kind ' + $kind); timeout = 10 }) } }
    $settings = @{ hooks = @{ UserPromptSubmit = @(& $hook 'start'); Stop = @(& $hook 'stop'); Notification = @(& $hook 'notify'); SessionStart = @(& $hook 'session') } } | ConvertTo-Json -Depth 6 -Compress
    Send-AgentrixEvent 'codex-started' -Agent 'claude'
    $claudeExit = 0
    try {
        $startInfo = [Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $global:AgentrixClaudeExecutable
        # What the reading view can show (electron/features/agents/reading-note.cjs); a later --append-system-prompt of the user's wins.
        $readingNote = if ($env:AGENTRIX_READING_NOTE) { @('--append-system-prompt', $env:AGENTRIX_READING_NOTE) } else { @() }
        $startInfo.Arguments = ((@('--settings', $settings) + $readingNote + @($args)) | ForEach-Object { ConvertTo-AgentrixArgument ([string]$_) }) -join ' '
        $startInfo.UseShellExecute = $false
        $startInfo.WorkingDirectory = (Get-Location).Path
        $claudeProcess = [Diagnostics.Process]::Start($startInfo)
        try { $claudeProcess.WaitForExit(); $claudeExit = $claudeProcess.ExitCode }
        finally { $claudeProcess.Dispose() }
    } catch {
        Write-Error $_
        $claudeExit = 1
    } finally {
        Send-AgentrixEvent 'codex-exited' $claudeExit -Agent 'claude'
        $global:LASTEXITCODE = $claudeExit
    }
}

if ($global:AgentrixAgentOnly) { return }

function global:prompt {
    Send-AgentrixEvent 'shell-prompt'
    'PS ' + (Get-Location).Path + '> '
}

# No user profile is modified. This wrapper exists only inside this terminal.
Write-Host '  AGENTRIX' -ForegroundColor DarkGray
Write-Host '  Type codex to start, or codex resume to continue a session.' -ForegroundColor DarkGray
Write-Host ''
Send-AgentrixEvent 'shell-ready'
