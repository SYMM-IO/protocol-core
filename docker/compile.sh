#!/bin/bash -e

for ((n=0;n<50;n++)); do # temp patch fix
    npx hardhat compile || { echo 'npx hardhat compile returned: '$? ; continue; }
    test -d artifacts && break
    echo 'artifacts not found! while compile returned 0'
done
test -d artifacts || {
    echo 'compile failed'
    exit 1
}
