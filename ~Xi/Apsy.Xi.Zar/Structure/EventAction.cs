using Apsy.Xi.Basic;

namespace Apsy.Xi.Zar.Structure
{
    public enum ActionType
    {
        Navigate,
        CallApi,
        ShowPopup,
        ChangeUIState
    }

    public class EventAction : Block
    {
        public string Name { get; set; }
        public EventAction Action { get; set; }  
        public ActionType Type { get; set; }
        public string ActionParamater { get; set; }
    }
}
