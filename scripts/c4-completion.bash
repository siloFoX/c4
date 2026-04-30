# Bash completion for c4. Source from .bashrc:
#   source /path/to/c4/scripts/c4-completion.bash

_c4_complete() {
  local cur prev cmd
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  cmd="${COMP_WORDS[1]}"

  local commands="daemon new task send key wait read read-now scrollback list close \
    health config init merge scribe templates profiles swarm token-usage status history \
    plan plan-read approve dispatch fleet rollback suspend resume restart cancel \
    batch-action batch cleanup auto resume session-id morning watch \
    audit projects departments cost nl workflow schedules schedule board transfer \
    backup restore"

  if [[ ${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${commands}" -- "${cur}") )
    return 0
  fi

  case "${cmd}" in
    daemon)
      COMPREPLY=( $(compgen -W "start stop restart status" -- "${cur}") )
      ;;
    fleet)
      COMPREPLY=( $(compgen -W "peers list" -- "${cur}") )
      ;;
    schedule)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "add remove enable run" -- "${cur}") )
      fi
      ;;
    workflow)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "run" -- "${cur}") )
      fi
      ;;
    board)
      # 2nd token is project name (free), 3rd is subcommand
      if [[ ${COMP_CWORD} -eq 3 ]]; then
        COMPREPLY=( $(compgen -W "add move delete" -- "${cur}") )
      fi
      ;;
    scribe)
      COMPREPLY=( $(compgen -W "start stop status scan" -- "${cur}") )
      ;;
    batch-action)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "close suspend resume rollback cancel restart" -- "${cur}") )
      else
        # Worker name suggestions from `c4 list`
        local names
        names=$(c4 list 2>/dev/null | awk 'NR>1 {print $1}')
        COMPREPLY=( $(compgen -W "${names}" -- "${cur}") )
      fi
      ;;
    new|task|send|key|read|read-now|wait|scrollback|close|merge|approve|rollback|suspend|resume|restart|cancel|history|plan|plan-read|watch)
      # 2nd arg = worker name
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        local names
        names=$(c4 list 2>/dev/null | awk 'NR>1 {print $1}')
        COMPREPLY=( $(compgen -W "${names}" -- "${cur}") )
      fi
      ;;
    nl)
      # nothing — free-form text
      ;;
    *)
      ;;
  esac
}

complete -F _c4_complete c4
