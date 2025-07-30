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

	function getUpdatedAverages(
		FundingFee memory fundingFee,
		uint256 newEpochs,
		uint256 previousEpochs
	) internal pure returns (int256 weightedAvgLongRate, int256 weightedAvgShortRate) {
		if (previousEpochs == 0 && newEpochs == 0) {
			weightedAvgLongRate = int256(fundingFee.weightedAvgLongRate);
			weightedAvgShortRate = int256(fundingFee.weightedAvgShortRate);
		}

		uint256 totalEpochs = previousEpochs + newEpochs;

		weightedAvgLongRate =
			(fundingFee.weightedAvgLongRate * int256(previousEpochs) + fundingFee.currentLongRate * int256(newEpochs)) /
			int256(totalEpochs);

		weightedAvgShortRate =
			(fundingFee.weightedAvgShortRate * int256(previousEpochs) + fundingFee.currentShortRate * int256(newEpochs)) /
			int256(totalEpochs);
	}

	function updateWeightedAverages(FundingFee storage fundingFee) internal {
		uint256 currentEpoch = getEpochOfTimestamp(block.timestamp, fundingFee.epochDuration);
		uint256 newEpochs = currentEpoch - fundingFee.lastUpdatedEpoch;
		if (newEpochs == 0) return;
		uint256 previousEpochs = fundingFee.lastUpdatedEpoch - fundingFee.startEpoch;
		(fundingFee.weightedAvgLongRate, fundingFee.weightedAvgShortRate) = getUpdatedAverages(fundingFee, newEpochs, previousEpochs);
		fundingFee.lastUpdatedEpoch = currentEpoch;
	}
}
