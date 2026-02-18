
import React, { useEffect, useState } from "react";
import io from "socket.io-client";
import "./App.css";

// Connect to your backend server
const socket = io("http://localhost:4000");

function App() {
  const [optionData, setOptionData] = useState({});
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [customFormula, setCustomFormula] = useState("CE.ltp + PE.ltp");

  useEffect(() => {
    // 1. Handle Connection States
    socket.on("connect", () => {
      console.log("Connected to WebSocket");
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      console.log("Disconnected");
      setIsConnected(false);
    });

    // 2. Listen for 'dataUpdate' event from Fyers.js
    socket.on("dataUpdate", (response) => {
      const { CE, PE } = response.data;

      // 3. Merge updates into existing state
      // Since backend sends only 'dirty' (changed) data, we must merge it, not replace it.
      setOptionData((prevData) => {
        const newData = { ...prevData };

        // Helper to update the map
        const updateMap = (list) => {
          if (list) {
            list.forEach((item) => {
              // Use symbol as unique key to store data
              newData[item.symbol] = item;
            });
          }
        };

        updateMap(CE);
        updateMap(PE);

        return newData;
      });
    });

    // Cleanup listeners on unmount
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("dataUpdate");
    };
  }, []);

  // 4. Process data for the Table (Group by Strike Price)
  const groupedData = Object.values(optionData).reduce((acc, item) => {
    // Skip the Index object itself (strike_price -1) if you only want options
    if (item.strike_price === -1) return acc;

    const strike = item.strike_price;
    if (!acc[strike]) {
      acc[strike] = { strike, CE: null, PE: null };
    }

    if (item.option_type === "CE") acc[strike].CE = item;
    if (item.option_type === "PE") acc[strike].PE = item;

    return acc;
  }, {});

  // Sort rows by Strike Price
  const sortedRows = Object.values(groupedData).sort((a, b) => a.strike - b.strike);

  // Calculate results for all rows to find the minimum value
  let minVal = Infinity;
  const rowsWithResults = sortedRows.map((row) => {
    try {
      const CE = row.CE || { ltp: 0, oi: 0, volume: 0 };
      const PE = row.PE || { ltp: 0, oi: 0, volume: 0 };
      const strike = row.strike;

      const func = new Function("CE", "PE", "strike", `return ${customFormula}`);
      const val = Number(func(CE, PE, strike));

      if (!isNaN(val)) {
        if (val < minVal) minVal = val;
        return { ...row, val, display: val.toFixed(2) };
      }
      return { ...row, val: null, display: "-" };
    } catch (e) {
      return { ...row, val: null, display: "Error" };
    }
  });

  return (
    <div className="App" style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>Nifty Option Chain (Live)</h1>
      
      <div style={{ marginBottom: "20px" }}>
        <strong>Status: </strong> 
        <span style={{ color: isConnected ? "green" : "red" }}>
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div style={{ marginBottom: "20px", padding: "15px", backgroundColor: "#f8f9fa", border: "1px solid #ddd", borderRadius: "4px" }}>
        <label style={{ fontWeight: "bold", marginRight: "10px" }}>Custom Formula:</label>
        <input
          type="text"
          value={customFormula}
          onChange={(e) => setCustomFormula(e.target.value)}
          style={{ width: "300px", padding: "8px", fontSize: "16px" }}
          placeholder="e.g. CE.ltp + PE.ltp"
        />
        <div style={{ marginTop: "5px", fontSize: "12px", color: "#666" }}>
          Try: <code>CE.ltp + PE.ltp</code> (Straddle) or <code>(CE.ltp - PE.ltp) + strike</code> (Synthetic Future)
        </div>
      </div>

      {/* Link to login if no data is flowing */}
      {sortedRows.length === 0 && (
        <div style={{ padding: "10px", backgroundColor: "#fff3cd", border: "1px solid #ffeeba" }}>
          <p>Waiting for data... Ensure you have logged in via the backend.</p>
          <a href="http://localhost:4000/api/fyers/login" target="_blank" rel="noreferrer">
            Click here to Login to Fyers
          </a>
        </div>
      )}

      <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", width: "100%", textAlign: "center" }}>
        <thead style={{ backgroundColor: "#333", color: "white" }}>
          <tr>
            <th colSpan="3" style={{ backgroundColor: "#1b5e20" }}>CALLS (CE)</th>
            <th style={{ backgroundColor: "#444" }}>STRIKE</th>
            <th colSpan="3" style={{ backgroundColor: "#b71c1c" }}>PUTS (PE)</th>
            <th style={{ backgroundColor: "#0277bd" }}>CUSTOM</th>
          </tr>
          <tr>
            <th>OI</th>
            <th>Volume</th>
            <th>LTP</th>
            <th>Price</th>
            <th>LTP</th>
            <th>Volume</th>
            <th>OI</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rowsWithResults.map((row) => (
            <tr key={row.strike} style={{ borderBottom: "1px solid #ddd" }}>
              {/* CE Columns */}
              <td>{row.CE ? row.CE.oi : "-"}</td>
              <td>{row.CE ? row.CE.volume : "-"}</td>
              <td style={{ fontWeight: "bold", color: "green" }}>
                {row.CE ? row.CE.ltp : "-"}
              </td>

              {/* Strike Price */}
              <td style={{ backgroundColor: "#f0f0f0", fontWeight: "bold" }}>
                {row.strike}
              </td>

              {/* PE Columns */}
              <td style={{ fontWeight: "bold", color: "red" }}>
                {row.PE ? row.PE.ltp : "-"}
              </td>
              <td>{row.PE ? row.PE.volume : "-"}</td>
              <td>{row.PE ? row.PE.oi : "-"}</td>
              <td style={{ 
                backgroundColor: (row.val !== null && row.val === minVal) ? "#ffeb3b" : "#e1f5fe", 
                fontWeight: "bold", 
                color: (row.val !== null && row.val === minVal) ? "#000" : "#01579b" 
              }}>
                {row.display}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
