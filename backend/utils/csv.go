package utils

import (
	"bytes"
	"encoding/csv"
	"io"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

// WriteCSVWithBOM 将记录集写入带有 UTF-8 BOM 头的 io.Writer
func WriteCSVWithBOM(w io.Writer, records [][]string) error {
	// 写入 UTF-8 BOM 头，保证 Excel 打开时不出现中文乱码
	if _, err := w.Write([]byte{0xEF, 0xBB, 0xBF}); err != nil {
		return err
	}
	csvWriter := csv.NewWriter(w)
	if err := csvWriter.WriteAll(records); err != nil {
		return err
	}
	csvWriter.Flush()
	return csvWriter.Error()
}

// NewCSVReaderWithEncoding 自动探测 UTF-8 或 GB18030 编码并返回标准 csv.Reader
func NewCSVReaderWithEncoding(data []byte) *csv.Reader {
	var reader *csv.Reader
	if utf8.Valid(data) {
		reader = csv.NewReader(bytes.NewReader(data))
	} else {
		decodedReader := transform.NewReader(bytes.NewReader(data), simplifiedchinese.GB18030.NewDecoder())
		reader = csv.NewReader(decodedReader)
	}
	reader.FieldsPerRecord = -1
	return reader
}

// CleanCSVHeaderMap 清理表头中的空白与 BOM 字符，生成列名到索引的映射表
func CleanCSVHeaderMap(headers []string) map[string]int {
	headerMap := make(map[string]int, len(headers))
	for i, col := range headers {
		cleanCol := strings.ReplaceAll(strings.TrimRight(strings.TrimLeft(col, "\xef\xbb\xbf\"' \t\r\n"), "\"' \t\r\n"), " ", "")
		headerMap[cleanCol] = i
	}
	return headerMap
}
