#!/bin/bash

# Replace these with your commands
command1="npx hardhat node"
command2="npx hardhat run scripts/Initialize.ts --network localhost"
command3="npx hardhat test --network localhost"

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

sleep 6

echo "Running Fuzz tests..."
eval "$command3" 2>&1 | tee -a $logfile
