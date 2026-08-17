package models

// MeResponse represents the standardized /api/me response across all Code subsystems
type MeResponse struct {
	ID           uint        `json:"id"`
	EmployeeID   string      `json:"employee_id"`
	Email        string      `json:"email"`
	Username     string      `json:"username"`
	Name         string      `json:"name"`
	IsAdmin      bool        `json:"is_admin"`
	IsActive     bool        `json:"is_active"`
	Roles        []string    `json:"roles"`
	DepartmentID *uint       `json:"department_id"`
	Department   *Department `json:"department,omitempty"`
}

// ToMeResponse converts a User model to MeResponse
func (u *User) ToMeResponse() MeResponse {
	return MeResponse{
		ID:           u.ID,
		EmployeeID:   u.EmployeeID,
		Email:        u.Email,
		Username:     u.Username,
		Name:         u.Name,
		IsAdmin:      u.IsAdmin || u.IsSuperAdmin(),
		IsActive:     u.IsActive,
		Roles:        u.GetRoles(),
		DepartmentID: u.DepartmentID,
		Department:   u.Department,
	}
}
