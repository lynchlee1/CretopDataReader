const fs = require("fs");
const PizZip = require("pizzip");

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function generatePpt(templatePath, outputPath, data) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`PPT 템플릿을 찾지 못했습니다: ${templatePath}`);
  }

  const content = fs.readFileSync(templatePath, "binary");
  const zip = new PizZip(content);

  for (const key of Object.keys(zip.files)) {
    if (!(key.startsWith("ppt/slides/slide") || key.startsWith("ppt/notesSlides/notesSlide")) || !key.endsWith(".xml")) {
      continue;
    }

    let xml = zip.files[key].asText();

    for (const [placeholderKey, value] of Object.entries(data)) {
      if (placeholderKey === "ownershipTableData") continue;
      if (placeholderKey === "call_percent") {
        xml = xml.replace(/X%/g, `${value}%`);
        continue;
      }
      if (placeholderKey === "refixing_percent") {
        xml = xml.replace(/Y%/g, `${value}%`);
        continue;
      }
      xml = xml.split(`{{${placeholderKey}}}`).join(String(value));
    }

    if (data.ownershipTableData) {
      let currentPos = xml.indexOf("<a:tbl>");
      while (currentPos !== -1) {
        const tblEnd = xml.indexOf("</a:tbl>", currentPos);
        if (tblEnd === -1) break;

        const tblXml = xml.substring(currentPos, tblEnd + 8);
        if (tblXml.includes("특관자1") || tblXml.includes("주주명")) {
          let rowIndex = 0;
          const trRegex = new RegExp("<a:tr[^>]*>.*?</a:tr>", "gs");
          const newTblXml = tblXml.replace(trRegex, (rowXml) => {
            if (rowIndex < 2 || rowIndex >= 12) {
              rowIndex += 1;
              return rowXml;
            }

            const dataRow = rowIndex - 2;
            let cellIndex = 0;
            const tcRegex = new RegExp("<a:tc[^>]*>.*?</a:tc>", "gs");
            const newRowXml = rowXml.replace(tcRegex, (cellXml) => {
              if (cellIndex >= 11) return cellXml;

              const cellData = data.ownershipTableData[dataRow]?.[cellIndex];
              let newCellXml = cellXml;
              if (cellData) {
                const text = escapeXml(cellData);
                if (newCellXml.includes("<a:t>")) {
                  newCellXml = newCellXml.replace(new RegExp("<a:t>.*?</a:t>"), `<a:t>${text}</a:t>`);
                  const extraAtRegex = new RegExp("</a:t>.*?<a:t>.*?</a:t>", "s");
                  while (extraAtRegex.test(newCellXml)) {
                    newCellXml = newCellXml.replace(extraAtRegex, "</a:t>");
                  }
                  if (cellIndex > 0) {
                    if (newCellXml.includes("<a:pPr ")) {
                      newCellXml = newCellXml.replace(/<a:pPr /g, '<a:pPr algn="r" marR="10800" ');
                    } else if (newCellXml.includes("<a:pPr/>")) {
                      newCellXml = newCellXml.replace(/<a:pPr\/>/g, '<a:pPr algn="r" marR="10800"/>');
                    } else {
                      newCellXml = newCellXml.replace(/<a:p>/g, '<a:p><a:pPr algn="r" marR="10800"/>');
                      newCellXml = newCellXml.replace(/<a:p [^>]*>/g, (match) => `${match}<a:pPr algn="r" marR="10800"/>`);
                    }
                  }
                } else if (newCellXml.includes("<a:p>")) {
                  const pPrTag = cellIndex > 0 ? '<a:pPr algn="r" marR="10800"/>' : "";
                  newCellXml = newCellXml.replace(
                    "<a:p>",
                    `<a:p>${pPrTag}<a:r><a:rPr sz="1000"><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${text}</a:t></a:r>`,
                  );
                } else if (newCellXml.includes("<a:p ")) {
                  const pPrTag = cellIndex > 0 ? '<a:pPr algn="r" marR="10800"/>' : "";
                  newCellXml = newCellXml.replace(
                    new RegExp("<a:p [^>]*>"),
                    (match) => `${match}${pPrTag}<a:r><a:rPr sz="1000"><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${text}</a:t></a:r>`,
                  );
                }
              } else {
                newCellXml = newCellXml.replace(new RegExp("<a:t>.*?</a:t>", "gs"), "");
              }

              cellIndex += 1;
              return newCellXml;
            });

            rowIndex += 1;
            return newRowXml;
          });
          xml = xml.substring(0, currentPos) + newTblXml + xml.substring(tblEnd + 8);
          currentPos += newTblXml.length;
        } else {
          currentPos = tblEnd + 8;
        }
        currentPos = xml.indexOf("<a:tbl>", currentPos);
      }
    }

    zip.file(key, xml);
  }

  fs.writeFileSync(outputPath, zip.generate({ type: "nodebuffer", compression: "DEFLATE" }));
  return outputPath;
}

module.exports = { generatePpt };
