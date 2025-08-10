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

	function getEpochsSinceLastUpdate(FundingFee memory fundingFee) internal view returns (uint256) {
		uint256 currentEpoch = getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
		return currentEpoch - fundingFee.lastUpdatedEpoch;
	}

	function getEpochsSinceStart(FundingFee memory fundingFee) internal view returns (uint256) {
		uint256 currentEpoch = getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
		return currentEpoch - fundingFee.startEpoch;
	}

	function getEpochsSince(FundingFee memory fundingFee, uint256 timestamp) internal view returns (uint256) {
		uint256 currentEpoch = getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
		uint256 lastUpdatedEpoch = getEpochOfTimestamp(timestamp, fundingFee.epochDuration);
		return currentEpoch - lastUpdatedEpoch;
	}

	function updateAccumulatedRates(FundingFee storage fundingFee) internal returns (int256 accumulatedLongRate, int256 accumulatedShortRate) {
		uint256 newEpochs = getEpochsSinceLastUpdate(fundingFee);
		uint256 previousEpochs = getEpochsSinceStart(fundingFee) - newEpochs;

		if (previousEpochs == 0 && newEpochs == 0) {
			accumulatedLongRate = int256(fundingFee.accumulatedLongRate);
			accumulatedShortRate = int256(fundingFee.accumulatedShortRate);
			return (accumulatedLongRate, accumulatedShortRate);
		}

		uint256 totalEpochs = previousEpochs + newEpochs;

		fundingFee.accumulatedLongRate =
			(fundingFee.accumulatedLongRate * int256(previousEpochs) + fundingFee.currentLongRate * int256(newEpochs)) /
			int256(totalEpochs);

		fundingFee.accumulatedShortRate =
			(fundingFee.accumulatedShortRate * int256(previousEpochs) + fundingFee.currentShortRate * int256(newEpochs)) /
			int256(totalEpochs);

		fundingFee.lastUpdatedEpoch = getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
		return (fundingFee.accumulatedLongRate, fundingFee.accumulatedShortRate);
	}
}
