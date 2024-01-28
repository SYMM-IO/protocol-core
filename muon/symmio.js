const { axios, BN, toBaseUnit, ethCall, ethGetBlockNumber, Web3, schnorrVerifyWithNonceAddress, soliditySha3 } = MuonAppUtils
axios.defaults.timeout = 5000
const elliptic = require("elliptic");
const EC = elliptic.ec;
const curve = new EC("secp256k1");

const scale = new BN(toBaseUnit('1', 18))
const ZERO = new BN(0)
const scaleUp = (value) => new BN(toBaseUnit(String(value), 18))

const ABI = [{ "inputs": [{ "internalType": "uint256[]", "name": "quoteIds", "type": "uint256[]" }], "name": "symbolNameByQuoteId", "outputs": [{ "internalType": "string[]", "name": "", "type": "string[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "partyA", "type": "address" }], "name": "nonceOfPartyA", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "partyB", "type": "address" }, { "internalType": "address", "name": "partyA", "type": "address" }], "name": "nonceOfPartyB", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "partyA", "type": "address" }], "name": "partyAPositionsCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "partyB", "type": "address" }, { "internalType": "address", "name": "partyA", "type": "address" }], "name": "partyBPositionsCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "partyA", "type": "address" }, { "internalType": "uint256", "name": "start", "type": "uint256" }, { "internalType": "uint256", "name": "size", "type": "uint256" }], "name": "getPartyAOpenPositions", "outputs": [{ "components": [{ "internalType": "uint256", "name": "id", "type": "uint256" }, { "internalType": "address[]", "name": "partyBsWhiteList", "type": "address[]" }, { "internalType": "uint256", "name": "symbolId", "type": "uint256" }, { "internalType": "enum PositionType", "name": "positionType", "type": "uint8" }, { "internalType": "enum OrderType", "name": "orderType", "type": "uint8" }, { "internalType": "uint256", "name": "openedPrice", "type": "uint256" }, { "internalType": "uint256", "name": "initialOpenedPrice", "type": "uint256" }, { "internalType": "uint256", "name": "requestedOpenPrice", "type": "uint256" }, { "internalType": "uint256", "name": "marketPrice", "type": "uint256" }, { "internalType": "uint256", "name": "quantity", "type": "uint256" }, { "internalType": "uint256", "name": "closedAmount", "type": "uint256" }, { "components": [{ "internalType": "uint256", "name": "cva", "type": "uint256" }, { "internalType": "uint256", "name": "lf", "type": "uint256" }, { "internalType": "uint256", "name": "partyAmm", "type": "uint256" }, { "internalType": "uint256", "name": "partyBmm", "type": "uint256" }], "internalType": "struct LockedValues", "name": "initialLockedValues", "type": "tuple" }, { "components": [{ "internalType": "uint256", "name": "cva", "type": "uint256" }, { "internalType": "uint256", "name": "lf", "type": "uint256" }, { "internalType": "uint256", "name": "partyAmm", "type": "uint256" }, { "internalType": "uint256", "name": "partyBmm", "type": "uint256" }], "internalType": "struct LockedValues", "name": "lockedValues", "type": "tuple" }, { "internalType": "uint256", "name": "maxFundingRate", "type": "uint256" }, { "internalType": "address", "name": "partyA", "type": "address" }, { "internalType": "address", "name": "partyB", "type": "address" }, { "internalType": "enum QuoteStatus", "name": "quoteStatus", "type": "uint8" }, { "internalType": "uint256", "name": "avgClosedPrice", "type": "uint256" }, { "internalType": "uint256", "name": "requestedClosePrice", "type": "uint256" }, { "internalType": "uint256", "name": "quantityToClose", "type": "uint256" }, { "internalType": "uint256", "name": "parentId", "type": "uint256" }, { "internalType": "uint256", "name": "createTimestamp", "type": "uint256" }, { "internalType": "uint256", "name": "statusModifyTimestamp", "type": "uint256" }, { "internalType": "uint256", "name": "lastFundingPaymentTimestamp", "type": "uint256" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }, { "internalType": "uint256", "name": "tradingFee", "type": "uint256" }], "internalType": "struct Quote[]", "name": "", "type": "tuple[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "partyB", "type": "address" }, { "internalType": "address", "name": "partyA", "type": "address" }, { "internalType": "uint256", "name": "start", "type": "uint256" }, { "internalType": "uint256", "name": "size", "type": "uint256" }], "name": "getPartyBOpenPositions", "outputs": [{ "components": [{ "internalType": "uint256", "name": "id", "type": "uint256" }, { "internalType": "address[]", "name": "partyBsWhiteList", "type": "address[]" }, { "internalType": "uint256", "name": "symbolId", "type": "uint256" }, { "internalType": "enum PositionType", "name": "positionType", "type": "uint8" }, { "internalType": "enum OrderType", "name": "orderType", "type": "uint8" }, { "internalType": "uint256", "name": "openedPrice", "type": "uint256" }, { "internalType": "uint256", "name": "initialOpenedPrice", "type": "uint256" }, { "internalType": "uint256", "name": "requestedOpenPrice", "type": "uint256" }, { "internalType": "uint256", "name": "marketPrice", "type": "uint256" }, { "internalType": "uint256", "name": "quantity", "type": "uint256" }, { "internalType": "uint256", "name": "closedAmount", "type": "uint256" }, { "components": [{ "internalType": "uint256", "name": "cva", "type": "uint256" }, { "internalType": "uint256", "name": "lf", "type": "uint256" }, { "internalType": "uint256", "name": "partyAmm", "type": "uint256" }, { "internalType": "uint256", "name": "partyBmm", "type": "uint256" }], "internalType": "struct LockedValues", "name": "initialLockedValues", "type": "tuple" }, { "components": [{ "internalType": "uint256", "name": "cva", "type": "uint256" }, { "internalType": "uint256", "name": "lf", "type": "uint256" }, { "internalType": "uint256", "name": "partyAmm", "type": "uint256" }, { "internalType": "uint256", "name": "partyBmm", "type": "uint256" }], "internalType": "struct LockedValues", "name": "lockedValues", "type": "tuple" }, { "internalType": "uint256", "name": "maxFundingRate", "type": "uint256" }, { "internalType": "address", "name": "partyA", "type": "address" }, { "internalType": "address", "name": "partyB", "type": "address" }, { "internalType": "enum QuoteStatus", "name": "quoteStatus", "type": "uint8" }, { "internalType": "uint256", "name": "avgClosedPrice", "type": "uint256" }, { "internalType": "uint256", "name": "requestedClosePrice", "type": "uint256" }, { "internalType": "uint256", "name": "quantityToClose", "type": "uint256" }, { "internalType": "uint256", "name": "parentId", "type": "uint256" }, { "internalType": "uint256", "name": "createTimestamp", "type": "uint256" }, { "internalType": "uint256", "name": "statusModifyTimestamp", "type": "uint256" }, { "internalType": "uint256", "name": "lastFundingPaymentTimestamp", "type": "uint256" }, { "internalType": "uint256", "name": "deadline", "type": "uint256" }, { "internalType": "uint256", "name": "tradingFee", "type": "uint256" }], "internalType": "struct Quote[]", "name": "", "type": "tuple[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256[]", "name": "symbolIds", "type": "uint256[]" }], "name": "symbolNameById", "outputs": [{ "internalType": "string[]", "name": "", "type": "string[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "address", "name": "partyA", "type": "address" }, { "internalType": "address[]", "name": "partyBs", "type": "address[]" }], "name": "allocatedBalanceOfPartyBs", "outputs": [{ "internalType": "uint256[]", "name": "", "type": "uint256[]" }], "stateMutability": "view", "type": "function" }]

const UPNL_TOLERANCE = scaleUp('0.001')
const PRICE_TOLERANCE = scaleUp('0.01')
const minusOne = new BN(-1)

const kucoinThousandPairs = ['PEPEUSDT', 'SHIBUSDT', 'FLOKIUSDT', 'LUNCUSDT']
const mexcThousandPairs = ['PEPEUSDT', 'SHIBUSDT', 'FLOKIUSDT', 'LUNCUSDT', 'XECUSDT', 'SATSUSDT']
const pairsWithSpecificSource = ['BLUEBIRDUSDT', 'BNXUSDT', 'DEFIUSDT', 'BTCDOMUSDT']

const priceUrl = process.env.PRICE_URL

module.exports = {
    APP_NAME: 'symmio',

    isPriceToleranceOk: function (price, expectedPrice, priceTolerance) {
        let priceDiff = new BN(price).sub(new BN(expectedPrice)).abs()
        const priceDiffPercentage = new BN(priceDiff).mul(scale).div(new BN(expectedPrice))
        return {
            isOk: !priceDiffPercentage.gt(new BN(priceTolerance)),
            priceDiffPercentage: parseFloat(priceDiffPercentage.mul(new BN(10000)).div(scale).toString()) / 100
        }
    },

    isUpnlToleranceOk: function (uPnl, expectedUpnl, notionalValueSum, uPnlTolerance) {
        if (new BN(notionalValueSum).eq(ZERO))
            return { isOk: new BN(expectedUpnl).eq(ZERO) }

        let uPnlDiff = new BN(uPnl).sub(new BN(expectedUpnl)).abs()
        const uPnlDiffInNotionalValue = uPnlDiff.mul(scale).div(new BN(notionalValueSum))
        return {
            isOk: !uPnlDiffInNotionalValue.gt(new BN(uPnlTolerance)),
            uPnlDiffInNotionalValue: uPnlDiffInNotionalValue.mul(new BN(100)).div(scale)
        }
    },

    getSymbols: async function (quoteIds, chainId, symmio, blockNumber) {
        const symbols = await ethCall(symmio, 'symbolNameByQuoteId', [quoteIds], ABI, chainId, blockNumber)
        if (symbols.includes('')) throw { message: 'Invalid quoteId' }
        return symbols
    },

    getBinancePrices: async function () {
        // Define the Binance API URL
        const binancePricesUrl = priceUrl + '/binance';
        const binanceLeveragesUrl = process.env.LEVERAGE_URL

        let promises = [

            // Make an HTTP GET request to the Binance API using Axios
            axios.get(binancePricesUrl),

            // Make an HTTP POST request to the Binance API using Axios
            axios.post(binanceLeveragesUrl, {
                headers: {
                    "accept": "*/*",
                    "Content-Type": "application/json"
                }
            }),
        ]

        const result = await Promise.all(promises)

        const priceData = result[0].data
        const data = result[1].data
        const leverageData = data.data.brackets

        // Create an empty object to store the prices map
        const pricesMap = {};
        const maxLeverages = {}

        // Iterate over the data received from the API
        priceData.forEach((el) => {
            // Convert the mark price to a string and store it in the prices map
            pricesMap[el.symbol] = scaleUp(el.price).toString();
        });

        leverageData.forEach((el) => {
            maxLeverages[el.symbol] = el.riskBrackets[0].maxOpenPosLeverage
        });

        // Return the populated prices map
        return { pricesMap, maxLeverages };
    },

    formatKucoinSymbol: function (kucoinPair) {
        let symbol = kucoinPair.symbol.slice(0, -1)
        return symbol
    },

    getKucoinPrices: async function () {
        const kucoinUrl = priceUrl + '/kucoin'
        const { data } = await axios.get(kucoinUrl, {
            headers: { "Accept-Encoding": "gzip,deflate,compress" }
        })
        const pricesMap = {}
        data.forEach((el) => {
            try {
                const symbol = this.formatKucoinSymbol(el)
                pricesMap[symbol] = scaleUp(Number(el.price).toFixed(10)).toString()
            }
            catch (e) { }
        })
        pricesMap['BTCUSDT'] = pricesMap['XBTUSDT']
        for (let symbol of kucoinThousandPairs) {
            if (pricesMap[symbol] == undefined) continue
            pricesMap['1000' + symbol] = new BN(pricesMap[symbol]).mul(new BN(1000)).toString()
        }
        pricesMap['LUNA2USDT'] = pricesMap['LUNAUSDT']
        return pricesMap
    },

    getMexcPrices: async function () {
        const mexcUrl = priceUrl + '/mexc'
        const { data } = await axios.get(mexcUrl)
        const pricesMap = {}
        data.forEach((el) => {
            const symbol = el.symbol.replace('_', '')
            pricesMap[symbol] = scaleUp(Number(el.price).toFixed(10)).toString()
        })

        for (let symbol of mexcThousandPairs)
            pricesMap['1000' + symbol] = new BN(pricesMap[symbol]).mul(new BN(1000)).toString()
        pricesMap['LUNA2USDT'] = pricesMap['LUNANEWUSDT']
        pricesMap['FILUSDT'] = pricesMap['FILECOINUSDT']
        pricesMap['BNXUSDT'] = pricesMap['BNXNEWUSDT']
        return pricesMap
    },

    checkPrices: function (symbols, markPrices, maxLeverages) {
        const expectedPrices = markPrices['binance']
        for (let symbol of symbols) {
            const expectedPrice = expectedPrices[symbol]
            if (expectedPrice == undefined) throw { message: 'Undefined Binance Price', symbol }
            let sourcesCount = 0
            for (let source of ['kucoin', 'mexc']) {
                const pricesMap = markPrices[source]
                let price = pricesMap[symbol]
                if (price == undefined) {
                    continue
                }
                sourcesCount += 1
                const priceTolerance = scaleUp(String(1 / maxLeverages[symbol]))
                let priceCheckResult = this.isPriceToleranceOk(price, expectedPrice, priceTolerance)
                if (!priceCheckResult.isOk) throw { message: 'Corrupted Price', symbol, diff: priceCheckResult.priceDiffPercentage }
            }
            if (sourcesCount == 0)
                throw { message: 'Single Source Symbol', symbol }
        }

        return true
    },

    getPrices: async function (symbols) {
        const promises = [
            this.getBinancePrices(),
            this.getKucoinPrices(),
            this.getMexcPrices(),
        ]

        const result = await Promise.all(promises)
        const markPrices = {
            'binance': result[0].pricesMap,
            'kucoin': result[1],
            'mexc': result[2],
        }
        const maxLeverages = result[0].maxLeverages

        this.checkPrices(symbols, markPrices, maxLeverages)

        return { pricesMap: markPrices['binance'], markPrices, maxLeverages }
    },

    fetchPrices: async function (quoteIds, chainId, symmio, blockNumber) {
        // Retrieve symbols corresponding to the given quoteIds
        const symbols = await this.getSymbols(quoteIds, chainId, symmio, blockNumber);

        // Fetch the latest prices and create a prices map
        const { pricesMap, markPrices, maxLeverages } = await this.getPrices(symbols);

        // Create an array of prices by matching symbols with prices in the map
        const prices = this.createPricesList(symbols, pricesMap);

        // Return an object containing the prices array and prices map
        return { symbols, prices, pricesMap, markPrices, maxLeverages };
    },

    createPricesList: function (symbols, pricesMap) {
        const prices = []
        symbols.forEach((symbol) => prices.push(pricesMap[symbol].toString()))
        return prices
    },

    calculateUpnl: async function (openPositions, prices) {
        let uPnl = new BN(0); // Initializes uPnl to zero
        let loss = new BN(0); // Initializes loss to zero
        let notionalValueSum = new BN(0); // Initializes notionalValueSum to zero

        // Iterates through each open position
        for (let [i, position] of openPositions.entries()) {
            const openedPrice = new BN(position.openedPrice); // Retrieves the opened price of the position
            const priceDiff = new BN(prices[i]).sub(openedPrice); // Calculates the price difference between the current price and the opened price
            const amount = new BN(position.quantity).sub(new BN(position.closedAmount)); // Calculates the remaining amount of the position

            // Calculates the uPnl for the current position based on the position type (long or short)
            const longPositionUpnl = amount.mul(priceDiff);
            const positionUpnl = position.positionType == '0' ? longPositionUpnl : minusOne.mul(longPositionUpnl);

            // Adds the position's uPnl to the total uPnl after scaling it
            uPnl = uPnl.add(positionUpnl.div(scale));
            // Add the position's uPnl to the total loss if it is negative
            if (positionUpnl.isNeg()) loss = loss.add(positionUpnl.div(scale));

            // Calculates the notional value of the position and adds it to the total notional value sum
            const positionNotionalValue = amount.mul(openedPrice).div(scale);
            notionalValueSum = notionalValueSum.add(positionNotionalValue);
        }

        // Returns the calculated uPnl and notional value sum
        return { uPnl, loss, notionalValueSum };
    },

    getPositionsCount: async function (parties, side, chainId, symmio, blockNumber) {
        if (side == 'A') return await ethCall(symmio, 'partyAPositionsCount', [parties.partyA], ABI, chainId, blockNumber)
        else if (side == 'B') return await ethCall(symmio, 'partyBPositionsCount', [parties.partyB, parties.partyA], ABI, chainId, blockNumber)
    },

    getOpenPositions: async function (parties, side, start, size, chainId, symmio, blockNumber) {
        if (side == 'A') return await ethCall(symmio, 'getPartyAOpenPositions', [parties.partyA, start, size], ABI, chainId, blockNumber)
        else if (side == 'B') return await ethCall(symmio, 'getPartyBOpenPositions', [parties.partyB, parties.partyA, start, size], ABI, chainId, blockNumber)
    },

    fetchOpenPositions: async function (parties, side, chainId, symmio, blockNumber) {
        const positionsCount = new BN(await this.getPositionsCount(parties, side, chainId, symmio, blockNumber))
        if (positionsCount.eq(new BN(0))) return { openPositions: [], quoteIds: [] }

        const size = 50
        const getsCount = parseInt(positionsCount.div(new BN(size))) + 1

        const openPositions = []
        for (let i = 0; i < getsCount; i++) {
            const start = i * size
            openPositions.push(...await this.getOpenPositions(parties, side, start, size, chainId, symmio))
        }

        let quoteIds = []
        let symbolIds = new Set()
        let partyBs = new Set()
        openPositions.forEach((position) => {
            quoteIds.push(String(position.id))
            symbolIds.add(String(position.symbolId))
            partyBs.add(position.partyB)
        })

        symbolIds = Array.from(symbolIds)
        partyBs = Array.from(partyBs)

        return {
            openPositions,
            quoteIds,
            symbolIds,
            partyBs,
        }
    },

    filterPositions: function (partyB, mixedOpenPositions) {
        let quoteIds = []
        let openPositions = []
        mixedOpenPositions.forEach((position) => {
            if (position.partyB == partyB) {
                openPositions.push(position)
                quoteIds.push(String(position.id))
            }
        })
        return { openPositions, quoteIds }
    },

    fetchPartyBsAllocateds: async function (chainId, symmio, partyA, partyBs, blockNumber) {
        const allocateds = await ethCall(symmio, 'allocatedBalanceOfPartyBs', [partyA, partyBs], ABI, chainId, blockNumber)
        return allocateds
    },

    uPnlPartyA: async function (partyA, chainId, symmio, blockNumber) {
        // Fetches the open positions and quote IDs for partyA
        const { openPositions, quoteIds, symbolIds, partyBs } = await this.fetchOpenPositions({ partyA }, 'A', chainId, symmio, blockNumber);

        // Retrieves the nonce of partyA
        const nonce = String(await ethCall(symmio, 'nonceOfPartyA', [partyA], ABI, chainId, blockNumber));

        // If there are no open positions, return the result with zero uPnl, notional value sum,
        // nonce, quote IDs, open positions, prices map and mark prices (retrieved using the getPrices function)
        if (openPositions.length == 0) {
            const { pricesMap, markPrices, maxLeverages } = await this.getPrices([]);
            return {
                uPnl: ZERO.toString(),
                loss: ZERO.toString(),
                notionalValueSum: ZERO.toString(),
                nonce,
                quoteIds,
                symbolIds: [],
                symbolIdsPrices: [],
                prices: [],
                openPositions,
                pricesMap,
                markPrices,
                maxLeverages,
            };
        }

        // Fetches the prices, prices map and mark prices for the quote IDs
        const { symbols, prices, pricesMap, markPrices, maxLeverages } = await this.fetchPrices(quoteIds, chainId, symmio, blockNumber);

        // Calculates the uPnl and notional value sum using the open positions and prices
        const partyBsAllocateds = await this.fetchPartyBsAllocateds(chainId, symmio, partyA, partyBs, blockNumber)
        let [uPnl, loss, notionalValueSum] = [ZERO, ZERO, ZERO]
        for (let [i, partyB] of partyBs.entries()) {
            const openPositionsPerPartyB = openPositions.filter((position) => position.partyB == partyB)
            const pricesPerPartyB = prices.filter((price, index) => openPositionsPerPartyB.includes(openPositions[index]))
            const { uPnl: uPnlPerPartyB, loss: lossPerPartyB, notionalValueSum: notionalValueSumPerPartyB } = await this.calculateUpnl(openPositionsPerPartyB, pricesPerPartyB);
            uPnl = uPnl.add(BN.min(uPnlPerPartyB, new BN(partyBsAllocateds[i])))
            loss = loss.add(lossPerPartyB)
            notionalValueSum = notionalValueSum.add(notionalValueSumPerPartyB)
        }

        // Returns the result with the calculated uPnl, notional value sum, nonce, prices map,
        // prices, quote IDs, open positions and mark prices
        return {
            uPnl: uPnl.toString(),
            loss: loss.toString(),
            notionalValueSum: notionalValueSum.toString(),
            nonce,
            pricesMap,
            symbolIds,
            symbols,
            symbolIdsPrices: Array.from(new Set(prices)),
            prices,
            quoteIds,
            openPositions,
            markPrices,
            maxLeverages,
        };
    },

    uPnlPartyB: async function (partyB, partyA, chainId, symmio, blockNumber) {
        // Fetches the open positions and quote IDs for partyB with the associated partyA
        const { openPositions, quoteIds } = await this.fetchOpenPositions({ partyB, partyA }, 'B', chainId, symmio, blockNumber);

        // Retrieves the nonce of partyB for the given partyA
        const nonce = String(await ethCall(symmio, 'nonceOfPartyB', [partyB, partyA], ABI, chainId, blockNumber));

        // If there are no open positions, return the result with zero uPnl, notional value sum,
        // nonce, and quote IDs
        if (openPositions.length == 0) {
            return {
                uPnl: ZERO.toString(),
                notionalValueSum: ZERO.toString(),
                nonce,
                quoteIds
            };
        }

        // Fetches the prices and prices map for the quote IDs
        const { prices, pricesMap, markPrices } = await this.fetchPrices(quoteIds, chainId, symmio, blockNumber);

        // Calculates the uPnl and notional value sum using the open positions and prices
        const { uPnl, notionalValueSum } = await this.calculateUpnl(openPositions, prices);

        // Returns the result with the calculated uPnl (multiplied by -1 to represent partyB's perspective),
        // notional value sum, nonce, prices map, prices, and quote IDs
        return {
            uPnl: minusOne.mul(uPnl).toString(),
            notionalValueSum: notionalValueSum.toString(),
            nonce,
            pricesMap,
            prices,
            quoteIds,
            markPrices
        };
    },

    uPnlPartyB_FetchedData: async function (partyB, partyA, chainId, pricesMap, mixedOpenPositions, symmio, blockNumber) {
        // Filters the mixed open positions to only include positions associated with partyB
        const { openPositions, quoteIds } = this.filterPositions(partyB, mixedOpenPositions);

        let uPnl, notionalValueSum, prices;

        if (openPositions.length > 0) {
            // Retrieves the symbols associated with the quote IDs
            const symbols = await this.getSymbols(quoteIds, chainId, symmio, blockNumber);

            // Creates a prices list using the symbols and prices map
            prices = this.createPricesList(symbols, pricesMap);

            // Calculates the uPnl and notional value sum using the open positions and prices
            const result = await this.calculateUpnl(openPositions, prices);
            uPnl = result.uPnl;
            notionalValueSum = result.notionalValueSum;
        }
        else {
            // If there are no open positions, set uPnl and notional value sum to zero
            uPnl = notionalValueSum = new BN(0);
            prices = [];
        }

        // Retrieves the nonce of partyB for the given partyA
        const nonce = String(await ethCall(symmio, 'nonceOfPartyB', [partyB, partyA], ABI, chainId, blockNumber));

        // Returns the result with the calculated uPnl, notional value sum, nonce, prices, and quote IDs
        return {
            uPnl,
            notionalValueSum,
            nonce,
            prices,
            quoteIds
        };
    },

    uPnlParties: async function (partyB, partyA, chainId, symmio, blockNumber) {
        // Checks if partyB and partyA are identical, and throws an error if they are
        if (partyB == partyA) {
            throw { message: 'Identical Parties Error' };
        }

        // Calculates the uPnl, nonce, notional value sum, prices map, prices, mark prices and quote IDs for partyA
        const { uPnl: uPnlA, nonce: nonceA, notionalValueSum: notionalValueSumA, pricesMap, markPrices, prices: pricesA, quoteIds: quoteIdsA, openPositions, maxLeverages } = await this.uPnlPartyA(partyA, chainId, symmio, blockNumber);

        // Calculates the uPnl, nonce, notional value sum, prices, and quote IDs for partyB using fetched data
        const { uPnl: uPnlB, nonce: nonceB, notionalValueSum: notionalValueSumB, prices: pricesB, quoteIds: quoteIdsB } = await this.uPnlPartyB_FetchedData(partyB, partyA, chainId, pricesMap, openPositions, symmio, blockNumber);

        // Returns the results with adjusted uPnl for partyB, uPnl for partyA, notional value sum for partyB and partyA,
        // nonces for partyB and partyA, prices map, mark prices, prices for partyB and partyA, and quote IDs for partyB and partyA
        return {
            uPnlB: minusOne.mul(uPnlB).toString(),
            uPnlA,
            notionalValueSumB: notionalValueSumB.toString(),
            notionalValueSumA,
            nonceB,
            nonceA,
            pricesMap,
            maxLeverages,
            markPrices,
            pricesB,
            pricesA,
            quoteIdsB,
            quoteIdsA,
        };
    },

    getSymbolPrice: async function (symbolId, pricesMap, markPrices, maxLeverages, symmio, chainId, blockNumber) {
        const [symbol] = (await ethCall(symmio, 'symbolNameById', [[symbolId]], ABI, chainId, blockNumber))
        let price = pricesMap[symbol]
        if (price == undefined) throw { message: 'Invalid symbol' }
        this.checkPrices([symbol], markPrices, maxLeverages)
        return price
    },

    onRequest: async function (request) {
        let {
            method,
            data: { params }
        } = request

        const latestBlockNumber = request.data.result ?
            request.data.result.latestBlockNumber :
            String(await ethGetBlockNumber(params.chainId));

        switch (method) {
            case 'uPnl_A':
            case 'partyA_overview': {
                let { partyA, chainId, symmio } = params
                const result = await this.uPnlPartyA(partyA, chainId, symmio, latestBlockNumber)
                delete result.openPositions
                let liquidationId
                if (request.data.result) {
                    liquidationId = request.data.result.liquidationId
                }
                else {
                    liquidationId = new Web3().eth.accounts.create().privateKey;
                }
                return Object.assign({}, { chainId, partyA, symmio, liquidationId, latestBlockNumber }, result)
            }

            case 'verify': {
                let { signature, reqId, nonceAddress, start, size, liquidationId, symmio, partyA, nonce, uPnl, loss, symbolIds, prices, timestamp, chainId } = params
                start = parseInt(start)
                size = parseInt(size)
                symbolIds = JSON.parse(symbolIds)
                symbolIds = symbolIds.map((symbolId) => String(symbolId))
                prices = JSON.parse(prices)
                prices = prices.map((price) => String(price))
                const signedParams = [
                    { name: "appId", type: "uint256", value: request.appId },
                    { name: "reqId", type: "bytes", value: reqId },
                    { type: 'bytes', value: liquidationId },
                    { type: 'address', value: symmio },
                    { type: 'string', value: 'verifyLiquidationSig' },
                    { type: 'address', value: partyA },
                    { type: 'uint256', value: nonce },
                    { type: 'int256', value: uPnl },
                    { type: 'int256', value: loss },
                    { type: 'uint256[]', value: symbolIds },
                    { type: 'uint256[]', value: prices },
                    { type: 'uint256', value: timestamp },
                    { type: 'uint256', value: chainId },
                ]
                const hash = soliditySha3(signedParams)
                const account = curve.keyFromPrivate(process.env.PRIVATE_KEY);
                const verifyingPubKey = account.getPublic();
                if (!await schnorrVerifyWithNonceAddress(hash, signature, nonceAddress, verifyingPubKey))
                    throw { message: `Signature Not Verified` }

                return {
                    liquidationId,
                    symmio,
                    partyA,
                    nonce,
                    uPnl,
                    loss,
                    symbolIds: symbolIds.slice(start, start + size),
                    prices: prices.slice(start, start + size),
                    timestamp,
                    chainId
                }

            }

            case 'uPnl_A_withSymbolPrice': {
                let { partyA, chainId, symbolId, symmio } = params
                const result = await this.uPnlPartyA(partyA, chainId, symmio, latestBlockNumber)
                const price = await this.getSymbolPrice(symbolId, result.pricesMap, result.markPrices, result.maxLeverages, symmio, chainId, latestBlockNumber)
                delete result.openPositions
                return Object.assign({}, { chainId, partyA, symbolId, price, symmio, latestBlockNumber }, result)
            }

            case 'uPnl_B': {
                let { partyB, partyA, chainId, symmio } = params
                const result = await this.uPnlPartyB(partyB, partyA, chainId, symmio, latestBlockNumber)
                return Object.assign({}, { chainId, partyB, partyA, symmio, latestBlockNumber }, result)
            }

            case 'uPnl': {
                let { partyB, partyA, chainId, symmio } = params
                const result = await this.uPnlParties(partyB, partyA, chainId, symmio, latestBlockNumber)
                return Object.assign({}, { chainId, partyB, partyA, symmio, latestBlockNumber }, result)
            }

            case 'uPnlWithSymbolPrice': {
                let { partyB, partyA, chainId, symbolId, symmio } = params
                const result = await this.uPnlParties(partyB, partyA, chainId, symmio, latestBlockNumber)
                const price = await this.getSymbolPrice(symbolId, result.pricesMap, result.markPrices, result.maxLeverages, symmio, chainId, latestBlockNumber)
                return Object.assign({}, { chainId, partyB, partyA, symbolId, price, symmio, latestBlockNumber }, result)
            }

            case 'price': {
                let { quoteIds, chainId, symmio } = params

                quoteIds = JSON.parse(quoteIds)
                const result = await this.fetchPrices(quoteIds, chainId, symmio, latestBlockNumber)
                return Object.assign({}, { chainId, quoteIds, symmio, latestBlockNumber }, result)
            }

            default:
                throw { message: `Unknown method ${method}` }
        }
    },

    /**
     * List of the parameters that need to be signed. 
     * APP_ID, reqId will be added by the
     * Muon Core and [APP_ID, reqId, … signParams]
     * should be verified on chain.
     */
    signParams: function (request, result) {
        let { method } = request;
        switch (method) {
            case 'uPnl_A': {
                let { partyA, uPnl, notionalValueSum, nonce, chainId, symmio } = result

                if (!this.isUpnlToleranceOk(uPnl, request.data.result.uPnl, notionalValueSum, UPNL_TOLERANCE).isOk)
                    throw { message: 'uPnl Tolerance Error' }

                return [
                    { type: 'address', value: symmio },
                    { type: 'address', value: partyA },
                    { type: 'uint256', value: nonce },
                    { type: 'int256', value: request.data.result.uPnl },
                    { type: 'uint256', value: request.data.timestamp },
                    { type: 'uint256', value: chainId },
                ]
            }

            case 'partyA_overview': {
                let { partyA, uPnl, loss, symbolIds, notionalValueSum, nonce, chainId, symmio, liquidationId } = result

                if (!this.isUpnlToleranceOk(uPnl, request.data.result.uPnl, notionalValueSum, UPNL_TOLERANCE).isOk)
                    throw { message: 'uPnl Tolerance Error' }
                if (!this.isUpnlToleranceOk(loss, request.data.result.loss, notionalValueSum, UPNL_TOLERANCE).isOk)
                    throw { message: 'Loss Tolerance Error' }

                return [
                    { type: 'bytes', value: liquidationId },
                    { type: 'address', value: symmio },
                    { type: 'string', value: 'verifyLiquidationSig' },
                    { type: 'address', value: partyA },
                    { type: 'uint256', value: nonce },
                    { type: 'int256', value: request.data.result.uPnl },
                    { type: 'int256', value: request.data.result.loss },
                    { type: 'uint256[]', value: symbolIds },
                    { type: 'uint256[]', value: request.data.result.symbolIdsPrices },
                    { type: 'uint256', value: request.data.timestamp },
                    { type: 'uint256', value: chainId },
                ]
            }

            case 'verify': {
                let { liquidationId, partyA, nonce, uPnl, loss, symbolIds, prices, timestamp, chainId, symmio } = result

                return [
                    { type: 'bytes', value: liquidationId },
                    { type: 'address', value: symmio },
                    { type: 'string', value: 'verifyLiquidationSig' },
                    { type: 'address', value: partyA },
                    { type: 'uint256', value: nonce },
                    { type: 'int256', value: uPnl },
                    { type: 'int256', value: loss },
                    { type: 'uint256[]', value: symbolIds },
                    { type: 'uint256[]', value: prices },
                    { type: 'uint256', value: timestamp },
                    { type: 'uint256', value: chainId },
                ]
            }

            case 'uPnl_A_withSymbolPrice': {
                let { partyA, uPnl, symbolId, price, notionalValueSum, nonce, chainId, symmio } = result

                if (!this.isUpnlToleranceOk(uPnl, request.data.result.uPnl, notionalValueSum, UPNL_TOLERANCE).isOk)
                    throw { message: 'uPnl Tolerance Error' }
                if (!this.isPriceToleranceOk(price, request.data.result.price, PRICE_TOLERANCE).isOk)
                    throw { message: `Price Tolerance Error` }

                return [
                    { type: 'address', value: symmio },
                    { type: 'address', value: partyA },
                    { type: 'uint256', value: nonce },
                    { type: 'int256', value: request.data.result.uPnl },
                    { type: 'uint256', value: symbolId },
                    { type: 'uint256', value: request.data.result.price },
                    { type: 'uint256', value: request.data.timestamp },
                    { type: 'uint256', value: chainId },
                ]
            }

            case 'uPnl_B': {
                let { partyB, partyA, uPnl, notionalValueSum, nonce, chainId, symmio } = result

                if (!this.isUpnlToleranceOk(uPnl, request.data.result.uPnl, notionalValueSum, UPNL_TOLERANCE).isOk)
                    throw { message: 'uPnl Tolerance Error' }

                return [
                    { type: 'address', value: symmio },
                    { type: 'address', value: partyB },
                    { type: 'address', value: partyA },
                    { type: 'uint256', value: nonce },
                    { type: 'int256', value: request.data.result.uPnl },
                    { type: 'uint256', value: request.data.timestamp },
                    { type: 'uint256', value: chainId },
                ]
            }

            case 'uPnl': {
                let { partyB, partyA, uPnlB, uPnlA, notionalValueSumB, notionalValueSumA, nonceB, nonceA, chainId, symmio } = result

                if (!this.isUpnlToleranceOk(uPnlB, request.data.result.uPnlB, notionalValueSumB, UPNL_TOLERANCE).isOk)
                    throw { message: 'uPnl Tolerance Error' }
                if (!this.isUpnlToleranceOk(uPnlA, request.data.result.uPnlA, notionalValueSumA, UPNL_TOLERANCE).isOk)
                    throw { message: 'uPnl Tolerance Error' }

                return [
                    { type: 'address', value: symmio },
                    { type: 'address', value: partyB },
                    { type: 'address', value: partyA },
                    { type: 'uint256', value: nonceB },
                    { type: 'uint256', value: nonceA },
                    { type: 'int256', value: request.data.result.uPnlB },
                    { type: 'int256', value: request.data.result.uPnlA },
                    { type: 'uint256', value: request.data.timestamp },
                    { type: 'uint256', value: chainId },
                ]
            }

            case 'uPnlWithSymbolPrice': {
                let { partyB, partyA, uPnlB, uPnlA, symbolId, price, notionalValueSumB, notionalValueSumA, nonceB, nonceA, chainId, symmio } = result

                if (!this.isUpnlToleranceOk(uPnlB, request.data.result.uPnlB, notionalValueSumB, UPNL_TOLERANCE).isOk)
                    throw { message: 'uPnl Tolerance Error' }
                if (!this.isUpnlToleranceOk(uPnlA, request.data.result.uPnlA, notionalValueSumA, UPNL_TOLERANCE).isOk)
                    throw { message: 'uPnl Tolerance Error' }
                if (!this.isPriceToleranceOk(price, request.data.result.price, PRICE_TOLERANCE).isOk)
                    throw { message: `Price Tolerance Error` }

                return [
                    { type: 'address', value: symmio },
                    { type: 'address', value: partyB },
                    { type: 'address', value: partyA },
                    { type: 'uint256', value: nonceB },
                    { type: 'uint256', value: nonceA },
                    { type: 'int256', value: request.data.result.uPnlB },
                    { type: 'int256', value: request.data.result.uPnlA },
                    { type: 'uint256', value: symbolId },
                    { type: 'uint256', value: request.data.result.price },
                    { type: 'uint256', value: request.data.timestamp },
                    { type: 'uint256', value: chainId },
                ]
            }

            case 'price': {
                let { quoteIds, prices, chainId, symmio } = result

                for (let [i, price] of prices.entries()) {
                    if (!this.isPriceToleranceOk(price, request.data.result.prices[i], PRICE_TOLERANCE).isOk)
                        throw { message: `Price Tolerance Error` }
                }

                return [
                    { type: 'address', value: symmio },
                    { type: 'uint256[]', value: quoteIds },
                    { type: 'uint256[]', value: request.data.result.prices },
                    { type: 'uint256', value: request.data.timestamp },
                    { type: 'uint256', value: chainId },
                ]
            }

            default:
                break
        }
    }
}