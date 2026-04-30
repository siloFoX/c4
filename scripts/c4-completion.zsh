# Zsh completion for c4. Source from .zshrc:
#   fpath=(/path/to/c4/scripts $fpath)
#   autoload -U compinit && compinit
# or directly:
#   source /path/to/c4/scripts/c4-completion.zsh

_c4() {
  local -a commands subcommands
  commands=(
    'daemon:Manage the c4 daemon'
    'new:Create a worker'
    'task:Send a task to a worker'
    'send:Send raw text'
    'key:Send a special key'
    'wait:Wait until idle'
    'read:Read new snapshots'
    'read-now:Read current screen'
    'scrollback:Read scrollback'
    'list:List workers'
    'close:Close a worker'
    'health:Daemon health'
    'config:Show or reload config'
    'init:First-time setup'
    'merge:Merge worker branch'
    'scribe:Session context recorder'
    'history:Task history'
    'approve:Approve critical command'
    'dispatch:Auto-pick peer + run task'
    'fleet:Fleet operations'
    'rollback:Roll back worker branch'
    'suspend:SIGSTOP worker'
    'resume:SIGCONT worker'
    'restart:Restart worker'
    'cancel:Cancel running task'
    'batch-action:Multi-worker action'
    'batch:Batch task'
    'cleanup:Cleanup orphan worktrees'
    'auto:Autonomous mode'
    'morning:Morning report'
    'watch:Stream worker output'
    'audit:Audit log'
    'projects:Per-project rollup'
    'departments:Department rollup'
    'cost:Cost report'
    'nl:Natural-language → workflow'
    'workflow:Run a workflow definition'
    'schedules:List schedules'
    'schedule:Add/remove/enable/run schedules'
    'board:PM kanban'
    'transfer:Inter-peer file transfer'
    'backup:Snapshot persistent state'
    'restore:Restore from backup'
    'metrics:Daemon + per-worker CPU/RSS table'
    'workspaces:List configured multi-repo workspaces'
    'doctor:Aggregated health + sanity checks'
    'events:Tail the daemon SSE event stream'
  )

  if (( CURRENT == 2 )); then
    _describe 'c4 command' commands
    return
  fi

  case "${words[2]}" in
    daemon)         _values 'subcommand' start stop restart status ;;
    fleet)          _values 'subcommand' peers list ;;
    schedule)       _values 'subcommand' add remove enable run ;;
    workflow)       _values 'subcommand' run ;;
    scribe)         _values 'subcommand' start stop status scan ;;
    batch-action)   _values 'action' close suspend resume rollback cancel restart ;;
  esac
}

compdef _c4 c4
