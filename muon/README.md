# Muon App Documentation

### Table of contents

- [Introduction](#introduction)
- [Overview of the Muon App](#overview-of-the-muon-app)
  - [Methods Overview](#methods-overview)
    - [uPnl_A](#upnl_a)
    - [partyA_overview](#partya_overview)
    - [verify](#verify)
    - [uPnl_A_withSymbolPrice](#upnl_a_withsymbolprice)
    - [uPnl_B](#upnl_b)
    - [uPnl](#upnl)
    - [uPnlWithSymbolPrice](#upnlwithsymbolprice)
    - [price](#price)
- [Functions Breakdown](#functions-breakdown)
  - [uPnlPartyA](#upnlpartya)
  - [uPnlPartyB](#upnlpartyb)
  - [uPnlPartyB_FetchedData](#upnlpartyb_fetcheddata)
  - [uPnlParties](#upnlparties)
  - [calculateUpnl](#calculateupnl)
  - [fetchPrices](#fetchprices)
  - [getPrices](#getprices)
  - [getBinancePrices](#getbinanceprices)
  - [checkPrices](#checkprices)
- [Summary](#summary)

# Introduction

The Muon app is designed to provide signed data for SYMM 3rd Party frontends (with Cloverfield used as an example in this text), a platform that enables users to trade assets and perpetual contracts (perps) on the Ethereum blockchain without the need for Know Your Customer (KYC) procedures. By utilizing their Ethereum wallet, users can participate in trading activities on Cloverfield.

Muon acts as an intermediary service, facilitating the generation and signing of data that is required for trading. This documentation will provide an overview of the app codebase, explaining its key components and functionalities.

# Overview of the Muon App

The Muon app is designed to provide various calculations and information related to unrealized profit and loss (uPnl) and price data. It offers separate uPnl calculations for individual parties, namely "partyA" and "partyB," as well as combined uPnl calculations for both parties together. Additionally, the app allows fetching the prices of given quotes. The following sections provide a detailed explanation of each method provided by the Muon app, showcasing how it calculates uPnl for partyA and partyB separately and together, as well as how it retrieves price information for specified quotes.

## Methods Overview

The Muon app has a set of methods of providing data for Cloverfield:

### uPnl_A

This method calculates the unrealized profit and loss (uPnl) for partyA individually. It takes the **partyA**, **chainId**, and **v3Contract** as parameters and returns the **uPnl** result for partyA.

### partyA_overview

This method is same as uPnl_A but at last its signature include **symbolIds** and corresponding **prices**.

### verify

The verify method takes several inputs, including the **signature**, **reqId**, **nonceAddress**, **start**, **size**, **v3Contract**, **partyA**, **nonce**, **uPnl**, **loss**, **symbolIds**, **prices**, **timestamp**, and **chainId**. It verifies the signature by comparing it with a generated hash of the provided parameters. If the signature is successfully verified, the method returns a subset of the input data, including the **v3contract**, **partyA**, **nonce**, **uPnl**, **loss**, **symbolIds** within a specified range, **prices** corresponding to those **symbolIds**, **timestamp**, and **chainId**. If the signature verification fails, an error is thrown.

### uPnl_A_withSymbolPrice

This method is similar to uPnl_A, but it also includes the price of a specific symbolID. It takes the **partyA**, **chainId**, **symbolID**, and **v3Contract** as parameters. It retrieves the uPnl result for partyA and also fetches the price of the specified symbolID. The result includes the **uPnl** for partyA and the **price** of the symbol.

### uPnl_B

This method calculates the uPnl for partyB individually. It takes the **partyB**, **partyA**, **chainId**, and **v3Contract** as parameters and returns the **uPnl** result for partyB.

### uPnl

This method calculates the **uPnl** for both partyA and partyB together. It takes the **partyB**, **partyA**, **chainId**, and **v3Contract** as parameters and returns the combined **uPnl** result for both parties.

### uPnlWithSymbolPrice

This method is similar to uPnl, but it also includes the price of a specific symbolID. It takes the **partyB**, **partyA**, **chainId**, **symbolID**, and **v3Contract** as parameters. It retrieves the combined uPnl result for both parties and fetches the price of the specified symbolID. The result includes the combined **uPnl** for both parties and the **price** of the symbol.

### price

This method fetches the prices of multiple quoteIds. It takes the **quoteIds**, **chainId**, and **v3Contract** as parameters. The quoteIds are parsed as JSON, and the method calls the fetchPrices function with these parameters to retrieve the prices of the quotes. The result includes the fetched **prices**.

These methods provide the functionality to calculate the uPnl for individual parties (partyA and partyB), as well as the combined uPnl for both parties. Additionally, the app allows fetching the prices of given quotes using the price method.

# Functions Breakdown

## uPnlPartyA

The `uPnlPartyA` function in the Muon app calculates the unrealized profit and loss (uPnl) for partyA. Here's a breakdown of its implementation:

```js
uPnlPartyA: async function (partyA, chainId, v3Contract) {
    // Fetches the open positions and quote IDs for partyA
    const { openPositions, quoteIds, symbolIds } = await this.fetchOpenPositions({ partyA }, 'A', chainId, v3Contract);

    // Retrieves the nonce of partyA
    const nonce = await ethCall(v3Contract, 'nonceOfPartyA', [partyA], ABI, chainId);

    // If there are no open positions, return the result with zero uPnl, notional value sum,
    // nonce, quote IDs, open positions, prices map and mark prices (retrieved using the getPrices function)
    if (openPositions.length == 0) {
        const { pricesMap, markPrices } = await this.getPrices([]);
        return {
            uPnl: ZERO.toString(),
            loss: ZERO.toString(),
            notionalValueSum: ZERO.toString(),
            nonce,
            quoteIds,
            symbolIds: [],
            prices: [],
            openPositions,
            pricesMap,
            markPrices
        };
    }

    // Fetches the prices, prices map and mark prices for the quote IDs
    const { symbols, prices, pricesMap, markPrices } = await this.fetchPrices(quoteIds, chainId, v3Contract);

    // Calculates the uPnl and notional value sum using the open positions and prices
    const { uPnl, loss, notionalValueSum } = await this.calculateUpnl(openPositions, prices);

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
        prices,
        quoteIds,
        openPositions,
        markPrices
    };
},
```

In summary, this function fetches the open positions and quote IDs for partyA, retrieves the nonce of partyA, and calculates the uPnl and notional value sum using the open positions and corresponding prices. If there are no open positions, it returns a result with zero uPnl and notional value sum, along with other relevant information such as nonce, quote IDs, open positions, prices map and markPrices.

## uPnlPartyB

The `uPnlPartyB` function in the Muon app calculates the unrealized profit and loss (uPnl) for partyB, given the associated partyA. Here's a breakdown of its implementation:

```js
uPnlPartyB: async function (partyB, partyA, chainId, v3Contract) {
    // Fetches the open positions and quote IDs for partyB with the associated partyA
    const { openPositions, quoteIds } = await this.fetchOpenPositions({ partyB, partyA }, 'B', chainId, v3Contract);
    
    // Retrieves the nonce of partyB for the given partyA
    const nonce = await ethCall(v3Contract, 'nonceOfPartyB', [partyB, partyA], ABI, chainId);
    
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
    
    // Fetches the prices for the quote IDs and prices map for all symbols
    const { prices, pricesMap } = await this.fetchPrices(quoteIds, chainId, v3Contract);
    
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
        quoteIds
    };
}
```

In summary, this function fetches the open positions and quote IDs for partyB with the associated partyA, retrieves the nonce of partyB for the given partyA, and calculates the uPnl and notional value sum using the open positions and corresponding prices. If there are no open positions, it returns a result with zero uPnl and notional value sum, along with other relevant information such as nonce and quote IDs. The calculated uPnl is multiplied by -1 to represent partyB's perspective.

## uPnlPartyB_FetchedData

The `uPnlPartyB_FetchedData` function in the Muon app calculates the unrealized profit and loss (uPnl) for partyB using fetched data. Here's a breakdown of its implementation:

```js
uPnlPartyB_FetchedData: async function (partyB, partyA, chainId, pricesMap, mixedOpenPositions, v3Contract) {
    // Filters the mixed open positions to only include positions associated with partyB
    const { openPositions, quoteIds } = this.filterPositions(partyB, mixedOpenPositions);

    let uPnl, notionalValueSum, prices;
    
    if (openPositions.length > 0) {
        // Retrieves the symbols associated with the quote IDs
        const symbols = await this.getSymbols(quoteIds, chainId, v3Contract);
        
        // Creates a prices list using the symbols and prices map
        prices = this.createPricesList(symbols, pricesMap);
        
        // Calculates the uPnl and notional value sum using the open positions and prices
        const result = await this.calculateUpnl(openPositions, prices);
        uPnl = result.uPnl;
        notionalValueSum = result.notionalValueSum;
    } else {
        // If there are no open positions, set uPnl and notional value sum to zero
        uPnl = notionalValueSum = new BN(0);
        prices = [];
    }

    // Retrieves the nonce of partyB for the given partyA
    const nonce = await ethCall(v3Contract, 'nonceOfPartyB', [partyB, partyA], ABI, chainId);

    // Returns the result with the calculated uPnl, notional value sum, nonce, prices, and quote IDs
    return {
        uPnl,
        notionalValueSum,
        nonce,
        prices,
        quoteIds
    };
}
```

In summary, this function filters the mixed open positions to include only the positions associated with partyB. It then checks if there are any open positions remaining. If there are open positions, it retrieves the symbols associated with the quote IDs, creates a prices list using the symbols and prices map, and calculates the uPnl and notional value sum using the open positions and prices. If there are no open positions, it sets the uPnl and notional value sum to zero. Finally, it retrieves the nonce of partyB for the given partyA and returns the result with the calculated uPnl, notional value sum, nonce, prices, and quote IDs.

## uPnlParties

The `uPnlParties` function in the Muon app calculates the unrealized profit and loss (uPnl) for both partyA and partyB and returns the results. Here's a breakdown of its implementation:

```js
uPnlParties: async function (partyB, partyA, chainId, v3Contract) {
    // Checks if partyB and partyA are identical, and throws an error if they are
    if (partyB == partyA) {
        throw { message: 'Identical Parties Error' };
    }

    // Calculates the uPnl, nonce, notional value sum, prices map, prices, and quote IDs for partyA
    const { uPnl: uPnlA, nonce: nonceA, notionalValueSum: notionalValueSumA, pricesMap, prices: pricesA, quoteIds: quoteIdsA, openPositions } = await this.uPnlPartyA(partyA, chainId, v3Contract);

    // Calculates the uPnl, nonce, notional value sum, prices, and quote IDs for partyB using fetched data
    const { uPnl: uPnlB, nonce: nonceB, notionalValueSum: notionalValueSumB, prices: pricesB, quoteIds: quoteIdsB } = await this.uPnlPartyB_FetchedData(partyB, partyA, chainId, pricesMap, openPositions, v3Contract);

    // Returns the results with adjusted uPnl for partyB, uPnl for partyA, notional value sum for partyB and partyA,
    // nonces for partyB and partyA, prices map, prices for partyB and partyA, and quote IDs for partyB and partyA
    return {
        uPnlB: minusOne.mul(uPnlB).toString(),
        uPnlA,
        notionalValueSumB: notionalValueSumB.toString(),
        notionalValueSumA,
        nonceB,
        nonceA,
        pricesMap,
        pricesB,
        pricesA,
        quoteIdsB,
        quoteIdsA
    };
}
```

In summary, this function first checks if partyB and partyA are identical and throws an error if they are. Then, it calls the uPnlPartyA function to calculate the uPnl, nonce, notional value sum, prices map, prices, and quote IDs for partyA. Next, it calls the uPnlPartyB_FetchedData function to calculate the uPnl, nonce, notional value sum, prices, and quote IDs for partyB using fetched data. Finally, it returns the results with the adjusted uPnl for partyB (multiplied by -1), uPnl for partyA, notional value sum for partyB and partyA, nonces for partyB and partyA, prices map, prices for partyB and partyA, and quote IDs for partyB and partyA.

## calculateUpnl

The `calculateUpnl` function in the Muon app is responsible for calculating the unrealized profit and loss (uPnl) and the notional value sum for a given set of open positions and their corresponding prices. Here's an explanation of how this function works:

```js
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
```

In summary, this function iterates through each open position and calculates the uPnl for each position by multiplying the remaining amount of the position by the price difference. The uPnl is adjusted based on the position type (long or short) and scaled before being added to the total uPnl. Additionally, the notional value of each position is calculated by multiplying the remaining amount by the opened price and scaled before being added to the total notional value sum. Finally, the function returns the calculated uPnl and notional value sum as an object.

## fetchPrices

The `fetchPrices` method obtains the latest prices for a set of quoteIds by fetching the symbols and corresponding prices. It returns the prices as an array and creates a map for convenient access within the Muon app. Here's a breakdown of its implementation:

```js
fetchPrices: async function (quoteIds, chainId, v3Contract) {
    // Retrieve symbols corresponding to the given quoteIds
    const symbols = await this.getSymbols(quoteIds, chainId, v3Contract);

    // Fetch the latest prices and create a prices map
    const { pricesMap, markPrices } = await this.getPrices(symbols);

    // Create an array of prices by matching symbols with prices in the map
    const prices = this.createPricesList(symbols, pricesMap);

    // Return an object containing the prices array and prices map
    return { symbols, prices, pricesMap, markPrices };
},
```

In summary, this function is responsible for retrieving prices corresponding to a given set of quoteIds. It utilizes other helper methods to fetch symbols, obtain the latest prices, and create a map of prices. By combining these components, the method returns an object containing an array of prices and a map that associates symbols with their respective prices. This enables the Muon app to efficiently access and utilize the required price data for contract-related operations.

## getPrices

```js
getPrices: async function (symbols) {
    // Create promises for retrieving prices from different exchanges
    const promises = [
        this.getBinancePrices(),  // Promise for Binance prices
        this.getKucoinPrices(),   // Promise for Kucoin prices
        this.getMexcPrices(),     // Promise for Mexc prices
    ]

    // Wait for all promises to resolve and get the results
    const result = await Promise.all(promises)

    // Store the prices in the markPrices object with exchange names as keys
    const markPrices = {
        'binance': result[0],   // Binance prices
        'kucoin': result[1],    // Kucoin prices
        'mexc': result[2],      // Mexc prices
    }

    // Check the retrieved prices for any corruption
    if (!this.checkPrices(symbols, markPrices)) {
        throw { message: `Corrupted Price` }
    }

    // Return the pricesMap and markPrices object
    return { pricesMap: markPrices['binance'], markPrices }
}
```

In this implementation, the `getPrices` function uses three separate functions (`getBinancePrices`, `getKucoinPrices`, and `getMexcPrices`) to fetch prices from different exchanges asynchronously. The results are then stored in the markPrices object, which includes the prices for each exchange. The function also checks the retrieved prices using the checkPrices function to ensure their validity. Finally, the function returns an object containing the pricesMap and markPrices for further usage.

## getBinancePrices

The `getBinancePrices` function retrieves the latest price data for various symbols from binance API. It makes an HTTP request to the API endpoint and processes the response to extract the symbol-price mappings. The extracted data is stored in an object, which is then returned by the function. Here's a breakdown of its implementation:

```js
getBinancePrices: async function () {
    // Define the Binance API URL
    const binanceUrl = 'https://fapi.binance.com/fapi/v1/premiumIndex';

    // Make an HTTP GET request to the Binance API using Axios
    const { data } = await axios.get(binanceUrl, {
        proxy: false,
        httpsAgent: new HttpsProxyAgent.HttpsProxyAgent(proxy)
    });

    // Create an empty object to store the prices map
    const pricesMap = {};

    // Iterate over the data received from the API
    data.forEach((el) => {
        // Convert the mark price to a string and store it in the prices map
        pricesMap[el.symbol] = scaleUp(el.markPrice).toString();
    });

    // Return the populated prices map
    return pricesMap;
},
```

In summary, this function implements a logic to fetch the latest price data for different symbols from an external API. It uses an HTTP request to the API endpoint and processes the response to extract the symbol-price mappings. The extracted data is stored in an object, which is returned by the function. This allows the application to access up-to-date price information for various symbols, enabling accurate calculations and analysis in the app.

## checkPrices

```js
checkPrices: function (symbols, markPrices) {
    // Get the expected prices from the Binance markPrices
    const expectedPrices = markPrices['binance']

    // Iterate over each symbol in the given symbols array
    for (let symbol of symbols) {
        // Get the expected price for the symbol
        const expectedPrice = expectedPrices[symbol]

        // Throw an error if the expected price is undefined
        if (expectedPrice == undefined) {
            throw { message: 'Undefined Binance Price' }
        }

        // Iterate over each source (Kucoin and Mexc) to compare their prices
        for (let source of ['kucoin', 'mexc']) {
            // Get the pricesMap for the source exchange
            const pricesMap = markPrices[source]

            // Get the price for the symbol from the pricesMap
            let price = pricesMap[symbol]

            // Throw an error if the price is undefined (unsupported symbol)
            if (price == undefined) {
                throw { message: 'Unsupported Symbol' }
            }

            // Check if the price tolerance is within the acceptable range
            if (!this.isPriceToleranceOk(price, expectedPrice, PRICE_TOLERANCE).isOk) {
                return false
            }
        }
    }

    // All prices are within tolerance, return true
    return true
}
```

The `checkPrices` function is responsible for verifying the validity of the fetched prices. It compares the prices of different sources (Kucoin and Mexc) with the expected prices from Binance. The function iterates over each symbol and checks if the expected price exists for the symbol in the Binance prices. If not, an error is thrown. Then, it retrieves the prices for the symbol from each source and checks if they fall within the acceptable price tolerance range using the `isPriceToleranceOk` function. If any price is outside the tolerance range, the function returns `false`. Otherwise, if all prices pass the tolerance check, it returns `true`, indicating that the prices are valid.

# Summary

To summarize the Muon app's capabilities and purpose, it offers a range of methods tailored specifically for contract-related scenarios. These methods play a vital role in providing the necessary signed data for SYMM 3rd party frontends (e.g. Cloverfield) smart contracts. By enabling functions such as fetching open positions, calculating uPnl, and retrieving external price data, the app facilitates seamless interaction with contracts, empowering users and developers to effectively manage and monitor their investments. With a strong emphasis on contract use cases, the Muon app serves as a valuable tool for securely integrating blockchain technology into various applications.
