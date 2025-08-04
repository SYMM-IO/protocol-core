// SPDX-License-Identifier: SYMM-Core-Business-Source-License-1.1
// This contract is licensed under the SYMM Core Business Source License 1.1
// Copyright (c) 2023 Symmetry Labs AG
// For more information, see https://docs.symm.io/legal-disclaimer/license
pragma solidity >=0.8.18;

import "../storages/SymbolStorage.sol";

library LibFundingRate {
	function getEpochOfTimestamp(uint256 timestamp, uint256 epochDuration) internal pure returns (uint256) {
		require(epochDuration > 0, "FundingRateFacet: Zero epoch duration");
		return timestamp / epochDuration;
	}

	function getCurrentAccumulatedRate(FundingFee memory fundingFee) internal view returns (int256 accumulatedLongRate, int256 accumulatedShortRate) {
		uint256 currentEpoch = getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
		uint256 newEpochs = currentEpoch - fundingFee.lastUpdatedEpoch;
		uint256 previousEpochs = fundingFee.lastUpdatedEpoch - fundingFee.startEpoch;

		if (previousEpochs == 0 && newEpochs == 0) {
			accumulatedLongRate = int256(fundingFee.accumulatedLongRate);
			accumulatedShortRate = int256(fundingFee.accumulatedShortRate);
			return (accumulatedLongRate, accumulatedShortRate);
		}

		uint256 totalEpochs = previousEpochs + newEpochs;

		accumulatedLongRate =
			(fundingFee.accumulatedLongRate * int256(previousEpochs) + fundingFee.currentLongRate * int256(newEpochs)) /
			int256(totalEpochs);

		accumulatedShortRate =
			(fundingFee.accumulatedShortRate * int256(previousEpochs) + fundingFee.currentShortRate * int256(newEpochs)) /
			int256(totalEpochs);
	}

	function updateAccumulatedRates(FundingFee storage fundingFee) internal {
		(fundingFee.accumulatedLongRate, fundingFee.accumulatedShortRate) = getCurrentAccumulatedRate(fundingFee);
		fundingFee.lastUpdatedEpoch = getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
	}
}
