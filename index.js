const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const SEMRUSH_API_KEY = process.env.SEMRUSH_API_KEY;
const PORT = process.env.PORT || 3000;

// MCP manifest - tells Claude what tools are available
app.get("/", (req, res) => {
  res.json({
    name: "semrush-mcp-server",
    version: "1.0.0",
    description: "SEMrush data for Claude",
    tools: [
      {
        name: "domain_overview",
        description: "Get traffic, keywords, and authority score for a domain",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string", description: "The domain to look up e.g. example.com" }
          },
          required: ["domain"]
        }
      },
      {
        name: "keyword_rankings",
        description: "Get top organic keywords and their rankings for a domain",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string", description: "The domain to check" },
            limit: { type: "number", description: "Number of keywords to return (default 10)" }
          },
          required: ["domain"]
        }
      },
      {
        name: "site_audit_issues",
        description: "Get top SEO issues found for a domain",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string", description: "The domain to audit" }
          },
          required: ["domain"]
        }
      },
      {
        name: "backlink_overview",
        description: "Get backlink count, referring domains, and authority info",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string", description: "The domain to check backlinks for" }
          },
          required: ["domain"]
        }
      },
      {
        name: "competitor_overview",
        description: "Get top organic competitors for a domain",
        inputSchema: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Your domain" },
            limit: { type: "number", description: "Number of competitors to return (default 5)" }
          },
          required: ["domain"]
        }
      }
    ]
  });
});

// Handle tool calls from Claude
app.post("/call", async (req, res) => {
  const { tool, input } = req.body;

  try {
    let result;

    if (tool === "domain_overview") {
      const r = await axios.get("https://api.semrush.com/", {
        params: {
          type: "domain_rank",
          key: SEMRUSH_API_KEY,
          domain: input.domain,
          database: "us",
          export_columns: "Dn,Rk,Or,Ot,Oc,Ad,At,Ac"
        }
      });
      result = parseSemrushResponse(r.data, ["Domain","Rank","Organic Keywords","Organic Traffic","Organic Cost","Paid Keywords","Paid Traffic","Paid Cost"]);
    }

    else if (tool === "keyword_rankings") {
      const limit = input.limit || 10;
      const r = await axios.get("https://api.semrush.com/", {
        params: {
          type: "domain_organic",
          key: SEMRUSH_API_KEY,
          domain: input.domain,
          database: "us",
          display_limit: limit,
          export_columns: "Ph,Po,Nq,Cp,Co,Tr"
        }
      });
      result = parseSemrushResponse(r.data, ["Keyword","Position","Search Volume","CPC","Competition","Traffic %"]);
    }

    else if (tool === "site_audit_issues") {
      const r = await axios.get("https://api.semrush.com/reports/v1/projects/", {
        params: {
          key: SEMRUSH_API_KEY,
          action: "report",
          type: "site_audit_issues",
          domain: input.domain
        }
      });
      result = { raw: r.data };
    }

    else if (tool === "backlink_overview") {
      const r = await axios.get("https://api.semrush.com/", {
        params: {
          type: "backlinks_overview",
          key: SEMRUSH_API_KEY,
          target: input.domain,
          target_type: "root_domain",
          export_columns: "ascore,total,domains_num,urls_num,ips_num,ipclassc_num,follows_num,nofollows_num"
        }
      });
      result = parseSemrushResponse(r.data, ["Authority Score","Total Backlinks","Referring Domains","Referring URLs","Referring IPs","Referring Class C","Dofollow","Nofollow"]);
    }

    else if (tool === "competitor_overview") {
      const limit = input.limit || 5;
      const r = await axios.get("https://api.semrush.com/", {
        params: {
          type: "domain_organic_organic",
          key: SEMRUSH_API_KEY,
          domain: input.domain,
          database: "us",
          display_limit: limit,
          export_columns: "Dn,Np,Or,Ot,Oc,Ad"
        }
      });
      result = parseSemrushResponse(r.data, ["Competitor Domain","Common Keywords","Organic Keywords","Organic Traffic","Organic Cost","Paid Keywords"]);
    }

    else {
      return res.status(400).json({ error: "Unknown tool: " + tool });
    }

    res.json({ result });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

// Helper to turn SEMrush's CSV-style response into clean JSON
function parseSemrushResponse(data, headers) {
  const lines = data.trim().split("\n");
  if (lines.length < 2) return { message: "No data returned", raw: data };
  return lines.slice(1).map(line => {
    const values = line.split(";");
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  });
}

app.listen(PORT, () => {
  console.log(`SEMrush MCP server running on port ${PORT}`);
});
