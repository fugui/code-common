package auth

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ExtractTokenFromHeader extracts the Bearer token from the Authorization header
func ExtractTokenFromHeader(c *gin.Context) string {
	tokenString := c.GetHeader("Authorization")
	if tokenString == "" {
		return ""
	}
	if len(tokenString) > 7 && tokenString[:7] == "Bearer " {
		return tokenString[7:]
	}
	return tokenString
}

// SimpleAuthMiddleware returns a Gin HandlerFunc verifying JWT token using the provided secret getter
func SimpleAuthMiddleware(jwtSecretGetter func() string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := ExtractTokenFromHeader(c)
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization header missing"})
			c.Abort()
			return
		}

		claims, err := ParseToken(tokenString, jwtSecretGetter())
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token signature"})
			c.Abort()
			return
		}

		c.Set("claims", claims)
		c.Set("user_id", claims.UserID)
		c.Set("username", claims.Username)
		c.Set("email", claims.Email)
		c.Set("name", claims.Name)
		c.Set("is_admin", claims.IsAdmin)
		c.Set("roles", claims.Roles)
		c.Next()
	}
}
