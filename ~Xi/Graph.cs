namespace Apsy.Xi.Basic
{
    public class Graph<T>
    {
        public List<Node<T>> Nodes { get; } = new();

        public Node<T> AddNode(T value)
        {
            var node = new Node<T>(value);
            Nodes.Add(node);
            return node;
        }

        public void AddEdge(Node<T> node1, Node<T> node2)
        {
            node1.Neighbors.Add(node2);
            node2.Neighbors.Add(node1);
        }
    }
}