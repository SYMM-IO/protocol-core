#!/bin/bash

python utils/update_sig_checks.py 1
npx hardhat test
python utils/update_sig_checks.py 0