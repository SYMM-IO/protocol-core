#!/bin/bash -e

npx hardhat compile
test -d artifacts || {
    echo 'compile failed'
    exit 1
}
