package utils

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// Response standard structure
type Response struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// PaginatedData standard structure for paginated lists across all subsystems
type PaginatedData struct {
	Items      interface{} `json:"items"`
	Total      int64       `json:"total"`
	Page       int         `json:"page"`
	PageSize   int         `json:"pageSize"`
	TotalPages int         `json:"totalPages"`
}

// ParsePagination 从 gin 请求中解析分页参数并做边界防护
func ParsePagination(c *gin.Context, defaultPageSize, maxPageSize int) (page int, pageSize int, offset int) {
	if defaultPageSize <= 0 {
		defaultPageSize = 15
	}
	if maxPageSize <= 0 {
		maxPageSize = 10000
	}

	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ = strconv.Atoi(c.DefaultQuery("pageSize", strconv.Itoa(defaultPageSize)))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}

	offset = (page - 1) * pageSize
	return page, pageSize, offset
}

// Success returns a standard success JSON response
func Success(c *gin.Context, data interface{}) {
	c.JSON(http.StatusOK, Response{
		Code:    0,
		Message: "success",
		Data:    data,
	})
}

// Error returns a standard error JSON response
func Error(c *gin.Context, httpStatus int, code int, message string) {
	c.JSON(httpStatus, Response{
		Code:    code,
		Message: message,
	})
	c.Abort()
}

// Paginated returns a standard paginated JSON response
func Paginated(c *gin.Context, items interface{}, total int64, page, pageSize int) {
	totalPages := 0
	if pageSize > 0 {
		totalPages = int((total + int64(pageSize) - 1) / int64(pageSize))
	}
	Success(c, PaginatedData{
		Items:      items,
		Total:      total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
	})
}

// PaginatedJSON 直接以扁平 JSON 格式响应分页数据（符合各子系统 REST API 惯例）
func PaginatedJSON(c *gin.Context, items interface{}, total int64, page, pageSize int) {
	totalPages := 0
	if pageSize > 0 {
		totalPages = int((total + int64(pageSize) - 1) / int64(pageSize))
	}
	c.JSON(http.StatusOK, gin.H{
		"items":      items,
		"total":      total,
		"page":       page,
		"pageSize":   pageSize,
		"totalPages": totalPages,
	})
}
