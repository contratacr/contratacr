#!/bin/zsh
# Siembra de datos del directorio (lugares OSM, extras, limpieza de salud, marcas, precios ARESEP).
# Uso:   SEED_DB_URL="postgresql://…" zsh run-seed.zsh test|production
# - La URL se lee SOLO de la variable de entorno SEED_DB_URL; nunca se imprime ni se pasa en la línea de comandos
#   (se descompone en PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE para psql).
# - Se rechaza si el project ref de la URL no coincide con el destino (test=oqheayqqprpciqdvdaqo,
#   production=kskueodxaksxvjrysouw). Solo pruebas: SEED_ALLOW_LOCAL=1 acepta 127.0.0.1/localhost/::1 con destino test.
# - Requiere conexión de SESIÓN (directa db.<ref>.supabase.co:5432 o pooler en modo sesión :5432); el pooler de
#   transacciones (:6543) se rechaza porque la sesión guarda el actor (set_config) y variables de psql entre pasos.
# - psql con ON_ERROR_STOP=1; registro en logs/<destino>-<fecha>.log (sin secretos).
# - Volver a ejecutarlo es seguro: cada parte mira su lote (batchId / archivo+parte) y omite lo ya hecho; las demás
#   llamadas tienen actionId fijo y la base devuelve el recibo guardado.
setopt err_exit no_unset pipe_fail
zmodload zsh/datetime
HERE=${0:A:h}
SQL_DIR=${SEED_SQL_DIR:-$HERE/sql}
LOG_DIR=${SEED_LOG_DIR:-$HERE/logs}
target=${1:-}
typeset -A REFS=(test oqheayqqprpciqdvdaqo production kskueodxaksxvjrysouw)
if [[ -z $target || -z ${REFS[$target]:-} ]]; then print -u2 "Uso: SEED_DB_URL=… zsh run-seed.zsh test|production"; exit 2; fi
if [[ -z ${SEED_DB_URL:-} ]]; then print -u2 "ABORTADO: SEED_DB_URL vacía o no definida."; exit 2; fi

# ---- descomponer la URL sin imprimirla
url=$SEED_DB_URL
unset SEED_DB_URL
if [[ $url != (postgres|postgresql)://* ]]; then print -u2 "ABORTADO: SEED_DB_URL no es una URL postgresql://"; exit 2; fi
rest=${url#*://}
query=""; [[ $rest == *\?* ]] && { query=${rest#*\?}; rest=${rest%%\?*}; }
dbname=postgres; [[ $rest == */* ]] && { dbname=${rest#*/}; rest=${rest%%/*}; }
[[ $rest == *@* ]] || { print -u2 "ABORTADO: la URL no trae usuario"; exit 2; }
userinfo=${rest%@*}; hostport=${rest##*@}
user=${userinfo%%:*}; pass=""; [[ $userinfo == *:* ]] && pass=${userinfo#*:}
if [[ $hostport == \[*\]* ]]; then host=${${hostport#\[}%%\]*}; port=${hostport##*\]}; port=${port#:}
else host=${hostport%%:*}; port=""; [[ $hostport == *:* ]] && port=${hostport##*:}; fi
port=${port:-5432}
urldecode(){ local s=${1//+/ }; print -rn -- "${(g::)s//\%/\\x}"; }
pass=$(urldecode "$pass"); user=$(urldecode "$user"); dbname=$(urldecode "$dbname")
sslmode=""; for kv in ${(s:&:)query}; do [[ $kv == sslmode=* ]] && sslmode=${kv#sslmode=}; done
unset url rest userinfo

# ---- comprobar destino (sin imprimir la URL ni el ref)
ref=${REFS[$target]}
is_local=0; [[ $host == (127.0.0.1|localhost|::1) ]] && is_local=1
if (( is_local )); then
  if [[ ${SEED_ALLOW_LOCAL:-0} != 1 || $target != test ]]; then
    print -u2 "ABORTADO: host local solo con SEED_ALLOW_LOCAL=1 y destino test."; exit 2; fi
  sslmode=${sslmode:-disable}
else
  ok=0
  [[ $host == db.$ref.supabase.co ]] && ok=1
  [[ $host == *.pooler.supabase.com && $user == *.$ref ]] && ok=1
  if (( ! ok )); then print -u2 "ABORTADO: el project ref de SEED_DB_URL no coincide con el destino '$target'."; exit 2; fi
  # SEED_SESSION_POOLER=1 (CI): the same Supavisor host serves session mode on 5432.
  [[ $port == 6543 && $host == *.pooler.supabase.com && ${SEED_SESSION_POOLER:-0} == 1 ]] && port=5432
  if [[ $port == 6543 ]]; then print -u2 "ABORTADO: puerto 6543 (pooler de transacciones). Use la conexión directa o el pooler de sesión (puerto 5432)."; exit 2; fi
  sslmode=${sslmode:-require}
fi

# ---- psql
PSQL=${SEED_PSQL:-}
if [[ -z $PSQL ]]; then
  for c in "$(command -v psql 2>/dev/null || true)" /opt/homebrew/opt/libpq/bin/psql /usr/local/opt/libpq/bin/psql \
           /Applications/Postgres.app/Contents/Versions/latest/bin/psql; do
    [[ -n $c && -x $c ]] && { PSQL=$c; break; }
  done
fi
[[ -n $PSQL && -x $PSQL ]] || { print -u2 "ABORTADO: no se encontró psql (defina SEED_PSQL=/ruta/a/psql)."; exit 2; }

export PGHOST=$host PGPORT=$port PGUSER=$user PGPASSWORD=$pass PGDATABASE=$dbname PGSSLMODE=$sslmode PGAPPNAME=contratacr-seed-directorio PGCONNECT_TIMEOUT=15
unset pass PGSERVICE PGSERVICEFILE 2>/dev/null || true

mkdir -p "$LOG_DIR"
stamp=$(date +%Y%m%d-%H%M%S)-$$
log="$LOG_DIR/$target-$stamp.log"
{
  print "== siembra del directorio · destino: $target · $(date '+%Y-%m-%d %H:%M:%S %Z') · psql: $($PSQL --version)"
  print "== paquete: $SQL_DIR (orden en ORDER.txt) · local=$is_local"
} | tee "$log"
t0=$EPOCHREALTIME
set +e
"$PSQL" -X -q -v ON_ERROR_STOP=1 -P pager=off -f "$SQL_DIR/run-all.sql" 2>&1 | tee -a "$log"
rc=${pipestatus[1]}
set -e
secs=$(( EPOCHREALTIME - t0 ))
if (( rc != 0 )); then
  printf '== FALLÓ (psql salió con %d) tras %.1f s. Nada a medias: cada paso es una sola transacción; revise el registro y vuelva a ejecutar.\n' $rc $secs | tee -a "$log"
  print "== registro: $log"; exit $rc
fi
printf '== TERMINADO en %.1f s\n' $secs | tee -a "$log"
print "== registro: $log"
