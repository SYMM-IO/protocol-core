#!/bin/bash

fuser -k 8545/tcp
fuser -k 8090/tcp

# Replace these with your commands
command1="npx hardhat node"
command2="npx hardhat run scripts/Initialize.ts --network localhost"
command3=". ../v3-hedger/.venv/bin/activate"
command4="../v3-hedger/runner ../v3-hedger/server_runner.py"
command5="npx hardhat test --network localhost"

# Log file path
logfile="output.log"
serverLogfile="serverLog.log"
detailedDebugFile="detailedDebug.log"

# Clear the log files
truncate -s 0 $logfile
truncate -s 0 $detailedDebugFile
truncate -s 0 $serverLogfile

echo "Running hardhat node"
eval "$command1" >/dev/null 2>&1 &

sleep 3

echo "Initializing..."
eval "$command2" 2>&1 | tee -a $logfile

# Activate the Python virtual environment
$command3

echo "Running hedger server"
eval "$command4" 2>&1 > $serverLogfile &

sleep 6

echo "Running Fuzz tests..."
eval "$command5" 2>&1 | tee -a $logfile
