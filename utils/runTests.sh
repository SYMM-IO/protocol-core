#!/bin/bash

python3 utils/update_sig_checks.py 1
npx hardhat test
python3 utils/update_sig_checks.py 0